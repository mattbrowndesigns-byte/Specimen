const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Gemini's free tier returns 503 "high demand" often enough that a single
// attempt regularly loses a description for no lasting reason. These are all
// transient, so back off and try again rather than leaving a record blank.
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callGemini(body) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Gemini returned no content");
      return text;
    }

    const detail = await res.text();
    lastError = new Error(`Gemini request failed: ${res.status} ${detail}`);
    // Carried on the error so the caller can tell "the free tier is busy" from
    // "this request was wrong". The first is worth queueing for later; the
    // second would fail identically forever.
    lastError.status = res.status;
    lastError.retryable = RETRY_STATUSES.has(res.status);

    if (!RETRY_STATUSES.has(res.status) || attempt === MAX_ATTEMPTS) throw lastError;

    // 2s, 4s, 8s. Well inside the callback's budget and long enough for a
    // demand spike to pass.
    await sleep(2000 * 2 ** (attempt - 1));
  }

  throw lastError;
}

// Only called when both <title> and og:site_name are missing or junk.
export async function guessSiteName({ domain, textSnippet }) {
  try {
    const prompt = `A web page at the domain "${domain}" has no usable <title> or og:site_name tag. Based on this snippet of its visible text, guess a short, clean display name for the site (just the name, 1-4 words, no punctuation like quotes).\n\nText snippet:\n${textSnippet || "(none available)"}`;
    const text = await callGemini({ contents: [{ parts: [{ text: prompt }] }] });
    const name = text.trim().replace(/^["']|["']$/g, "");
    return name || null;
  } catch (err) {
    console.error("guessSiteName failed:", err.message);
    return null;
  }
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING", nullable: true },
    summary: { type: "STRING" },
    tags: {
      type: "OBJECT",
      properties: {
        vertical: { type: "ARRAY", items: { type: "STRING" } },
        page_type: { type: "ARRAY", items: { type: "STRING" } },
        block_pattern: { type: "ARRAY", items: { type: "STRING" } },
        aesthetic: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["vertical", "page_type", "block_pattern", "aesthetic"],
    },
    proposed_tag: {
      type: "OBJECT",
      nullable: true,
      properties: {
        facet: { type: "STRING" },
        label: { type: "STRING" },
      },
    },
    // Only the representative pages, not every link it was shown.
    pages: {
      type: "ARRAY",
      nullable: true,
      items: {
        type: "OBJECT",
        properties: {
          url: { type: "STRING" },
          page_type: { type: "STRING", nullable: true },
          tier: { type: "STRING", nullable: true },
          utility_label: { type: "STRING", nullable: true },
        },
        required: ["url"],
      },
    },
  },
  required: ["summary", "tags"],
};

export async function imageToBase64(imageUrl) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch screenshot: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

async function callGeminiVision({ prompt, imageBase64 }) {
  const text = await callGemini({
    contents: [
      {
        parts: [{ text: prompt }, { inlineData: { mimeType: "image/webp", data: imageBase64 } }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });
  return JSON.parse(text);
}

// vocabulary: { vertical: string[], page_type: string[], block_pattern: string[], aesthetic: string[] }
// (current is_approved slugs per facet, read fresh from the DB so tag-management edits take effect immediately)
// discoveredPages: [{ url, label }] pulled from this site's nav/footer at save time, or [].
export async function enrichSite({ name, domain, url, screenshotUrl, vocabulary, discoveredPages = [] }) {
  const imageBase64 = await imageToBase64(screenshotUrl);

  // Selection, not classification. A nav mega-menu yields every flavour of
  // every product; what's wanted is one page per template a designer would
  // want to look at — the shop archive, one product detail, pricing, an FAQ.
  const pagesBlock = discoveredPages.length
    ? `\n\n4. These nav/footer links were found on this site's homepage. Pick out the ones that represent the site's distinct PAGE TEMPLATES — the pages a designer studying this site would want to see — and return only those in the "pages" field as [{url, page_type}], using each url exactly as given.

Rules for this selection:
   - ONE page per kind. If a dozen links are individual products, articles or team members, keep the single best example and drop the rest — five product pages are one template shown five times.
   - Skip utility and legal pages (privacy, terms, cookie policy, accessibility statement, sitemap, login, cart, account, gift cards, store locator), social links, and anything off this site's own domain.
   - Skip anything that's a variant of the homepage you're already looking at.
   - Aim for 4-10 entries. Fewer is fine if the site genuinely has few templates. Never pad the list to reach a number.
   - tier: how central the page is to the site, one of "primary", "secondary" or "tertiary".
     - primary: the pages the site is built to send you to — the main product or service page, pricing, the principal solution page. If there are several service or product landing pages, pick the single most prominent one and make only that one primary.
     - secondary: the supporting pages a visitor reaches when they want more — about, FAQ, blog index, careers, contact, a demo request, docs home.
     - tertiary: an individual instance rather than a template — one blog post, one case study, one job listing, one FAQ entry.
     An index and one of its entries are never the same tier: a blog index is secondary and a single post is tertiary.
   - page_type must be one of: ${vocabulary.page_type.join(", ")} — or null if none fit.
   - utility_label: what the page IS, in 1-3 words, Title Case — "About Us", "Request A Demo", "Product Archive", "Product Detail", "Blog Archive", "Blog Post", "Pricing", "Careers". This is not the link's own wording: a nav says "Why us" or "Get started free" because it's selling to that site's visitors, and what's wanted here is the page's function, named the same way it would be on any other site.

Links found:
${discoveredPages.map((p) => `- ${p.url} ("${p.label}")`).join("\n")}`
    : "";

  const prompt = `You are cataloguing a screenshot of the homepage of "${name || domain}" (${url}) for a personal design-inspiration library.

Look at the attached full-page screenshot and do the following:

1. Write a 3-5 sentence summary of the page for a UI/product designer: what it's for, and notably how it's designed (layout, structure, standout patterns).
2. Pick tags from these four closed lists. Only use these exact values, never invent your own spelling or new values in this step:
   - vertical (1-2): ${vocabulary.vertical.join(", ")}
   - page_type (1-2): ${vocabulary.page_type.join(", ")}
   - aesthetic (1-2): ${vocabulary.aesthetic.join(", ")}
   - block_pattern (up to 8): ${vocabulary.block_pattern.join(", ")}
   If truly nothing in a list fits, return an empty array for that facet rather than forcing a bad match.

   block_pattern is an inventory, not a summary. Work down the screenshot from top to bottom and name every distinct section you can see -- tabbed content, an accordion, an image-and-content split, a stat band, a logo wall, a comparison table, a step-by-step, a team grid, a newsletter signup, and so on. Most pages have five or more.

   Three exceptions, because every site on the internet has them and tagging them by name makes the tag useless for searching:
   - The navigation: only tag it if it's a distinct kind (a mega menu, say). An ordinary header bar is not worth recording.
   - The hero: never tag it as just "hero". Say what kind it is -- image, video, type-led, split, product shot, or one with a form in it.
   - The footer: same. Minimal, mega, or one built around a CTA. Not "footer".
3. Optionally, if you think there's a real pattern on this page that none of the block_pattern or aesthetic values above describe, propose exactly ONE new tag as {facet, label}. Only do this if it's a genuinely distinct, reusable concept — not a rewording of an existing tag. Otherwise set proposed_tag to null.

${!name ? `This site had no clean title available — also propose a short, clean display name for it (1-4 words) in the "name" field.` : `Set "name" to null, we already have a good name.`}${pagesBlock}`;

  return callGeminiVision({ prompt, imageBase64 });
}

// A component is a cropped-out region of a page (a hero, a pricing table,
// whatever the owner drew a box around) rather than a full-page screenshot.
export async function enrichComponent({ sourceUrl, imageBase64, vocabulary }) {
  const prompt = `You are cataloguing a cropped screenshot of one UI component/section (not a full page) taken from ${sourceUrl}, for a personal design-inspiration library.

Look at the attached crop and do three things:

1. Write a 1-3 sentence summary for a UI/product designer describing what this component is and how it's designed.
2. Propose a short name for this component (2-5 words, e.g. "Pricing table with toggle").
3. Pick 1-2 tags from EACH of these four closed lists that best describe it. Only use these exact values. block_pattern and aesthetic almost always apply to a component; vertical and page_type only if evident from context — leave those empty otherwise:
   - vertical: ${vocabulary.vertical.join(", ")}
   - page_type: ${vocabulary.page_type.join(", ")}
   - block_pattern: ${vocabulary.block_pattern.join(", ")}
   - aesthetic: ${vocabulary.aesthetic.join(", ")}
4. Optionally propose exactly ONE new tag as {facet, label} if there's a genuinely distinct, reusable concept none of the above cover. Otherwise set proposed_tag to null.`;

  return callGeminiVision({ prompt, imageBase64 });
}

const FONT_SCHEMA = {
  type: "OBJECT",
  properties: {
    fonts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          family: { type: "STRING" },
          display_name: { type: "STRING" },
          foundry: { type: "STRING", nullable: true },
          foundry_url: { type: "STRING", nullable: true },
          classification: { type: "STRING", nullable: true },
          is_custom: { type: "BOOLEAN" },
          google_match: { type: "STRING", nullable: true },
          google_note: { type: "STRING", nullable: true },
          adobe_match: { type: "STRING", nullable: true },
          adobe_slug: { type: "STRING", nullable: true },
          adobe_note: { type: "STRING", nullable: true },
        },
        required: ["family", "display_name", "is_custom"],
      },
    },
  },
  required: ["fonts"],
};

// Turns what the browser measured into what a designer would say about it.
//
// The measurement gives a CSS family name, which is often a slug ("sohne",
// "SuisseIntl") and never says who drew it. This resolves the real name, the
// foundry, and -- since most of these are licensed and some are bespoke -- the
// nearest thing on Google Fonts and Adobe Fonts.
//
// Every URL this returns is treated as a claim, not a fact: fontMatch.js
// fetches each one and drops the ones that don't answer.
export async function identifyFonts({ domain, fonts, fontHosts = [] }) {
  const list = fonts
    .map(
      (f) =>
        `- CSS family "${f.family}"${f.source_host ? `, served from ${f.source_host}` : ""}, ${Math.round(
          f.share * 100
        )}% of the page's text, largest size seen ${f.max_size}px`
    )
    .join("\n");

  const prompt = `These typefaces were measured rendering on the website ${domain}. The names come from CSS, so some are slugs or internal build names rather than the typeface's real name.

${list}
${fontHosts.length ? `\nFont files on this page were served from: ${fontHosts.join(", ")}.` : ""}

For each one, return:
- family: the CSS name exactly as given above, so I can match your answer back.
- display_name: the typeface's real, correctly spelled name ("sohne" is Söhne, "SuisseIntl" is Suisse Int'l). If the CSS name is already the real name, repeat it.
- foundry: the type foundry or designer that released it (e.g. Klim Type Foundry, Swiss Typefaces, Commercial Type). Null if you genuinely don't know — never guess.
- foundry_url: the URL of that typeface's own page on the foundry's site, or the foundry's homepage if you're unsure of the deeper link. Null if you don't know one.
- classification: a short description a designer would use ("neo-grotesque sans", "transitional serif", "geometric sans", "monospace").
- is_custom: true only if this face was drawn exclusively for this brand and isn't licensable by anyone else.
- google_match / google_note: the closest equivalent that is actually on Google Fonts, and a 6-12 word note on why it's close (proportions, terminals, x-height, mood). If this typeface IS a Google font, set both to null.
- adobe_match / adobe_slug / adobe_note: the same for Adobe Fonts, plus the slug from its Adobe Fonts URL (fonts.adobe.com/fonts/SLUG). If this typeface IS on Adobe Fonts already, set all three to null.

Only name a Google or Adobe font you are confident exists on that service. A wrong suggestion is worse than none, so return null rather than reaching.`;

  const text = await callGemini({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: FONT_SCHEMA },
  });
  return JSON.parse(text);
}
