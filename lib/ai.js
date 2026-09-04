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
   - At most ONE page per page_type. If a dozen links are individual products, articles or team members, keep the single best example as the template for that type and drop the rest.
   - Prefer the evergreen, structural pages of a site of this kind. For a store that means the shop/collection archive, one product detail page, a subscription or bundle page, FAQ, about. For a SaaS site it means product/features, pricing, integrations, a demo request, docs, about, careers.
   - Skip utility and legal pages (privacy, terms, cookie policy, accessibility statement, sitemap, login, cart, account, gift cards, store locator), social links, and anything off this site's own domain.
   - Skip anything that's a variant of the homepage you're already looking at.
   - Aim for 4-10 entries. Fewer is fine if the site genuinely has few templates. Never pad the list to reach a number.
   - page_type must be one of: ${vocabulary.page_type.join(", ")} — or null if the page is clearly a distinct template but none of those values fit.

Links found:
${discoveredPages.map((p) => `- ${p.url} ("${p.label}")`).join("\n")}`
    : "";

  const prompt = `You are cataloguing a screenshot of the homepage of "${name || domain}" (${url}) for a personal design-inspiration library.

Look at the attached full-page screenshot and do the following:

1. Write a 3-5 sentence summary of the page for a UI/product designer: what it's for, and notably how it's designed (layout, structure, standout patterns).
2. Pick 1-2 tags from EACH of these four closed lists that best describe this page. Only use these exact values, never invent your own spelling or new values in this step:
   - vertical: ${vocabulary.vertical.join(", ")}
   - page_type: ${vocabulary.page_type.join(", ")}
   - block_pattern: ${vocabulary.block_pattern.join(", ")}
   - aesthetic: ${vocabulary.aesthetic.join(", ")}
   If truly nothing in a list fits, return an empty array for that facet rather than forcing a bad match.
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
