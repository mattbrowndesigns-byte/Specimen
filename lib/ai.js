// The free tier's cap is 20 requests a day, PER MODEL, per project -- Google
// names it outright when it refuses you:
//
//   quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier, quotaValue: 20
//
// A site save spends two of those (tags, then typefaces), so one model is ten
// saves a day. Measured against the real history, three days this month went
// past it and two more came within a retry: 34 requests on 04 Sep, 22 on the
// 5th, 34 on the 17th. The sites carrying measured-but-unnamed typefaces are
// the ones saved on those days, because naming is the second call and the
// second call is the one that gets refused.
//
// "Per model" is the useful half of that sentence. A second model is a second
// allowance on the same key, so the fallbacks are not a downgrade -- they are
// the days that used to fail. Tested: both answer a structured vision request
// and both read "Logo Carousel" off a sliced page.
//
// Order matters. The first is the capable one and does the work whenever it
// can; the others only ever see a request that would otherwise have been
// refused outright.
const GEMINI_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
const urlFor = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// Gemini's free tier returns 503 "high demand" often enough that a single
// attempt regularly loses a description for no lasting reason. Backing off a
// few seconds and trying again is the right answer to a busy server.
//
// It is the wrong answer to 429, and that distinction is the whole of this
// block. A 429 is the per-minute quota, and a per-minute quota does not reset
// in the fourteen seconds these sleeps add up to -- so every retry lands in
// the same closed window, fails identically, and spends three more requests of
// the quota that was already exhausted. Worse, it does it inside a route with
// a 60-second ceiling.
//
// So a 429 is still *retryable*, because the queue should pick it up, but it
// is not retried here. The queue's first backoff is two minutes, which is the
// wait this actually needs.
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_NOW_STATUSES = new Set([500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

import { fetchImage, toImageParts } from "@/lib/screenshotParts";
import { readPageStructure, describeStructure } from "@/lib/pageStructure";
import { markQuotaExhausted, clearQuotaMark } from "@/lib/quotaState";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One model, with the 5xx retries. Quota exhaustion is thrown straight back
// so the caller can move to the next model rather than sleeping on this one.
async function callModel(model, body) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${urlFor(model)}?key=${process.env.GEMINI_API_KEY}`, {
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

    if (!RETRY_NOW_STATUSES.has(res.status) || attempt === MAX_ATTEMPTS) throw lastError;

    // 2s, 4s, 8s: long enough for a demand spike to pass, short enough to stay
    // inside the route's budget. Only 5xx gets here; see above for why 429
    // leaves immediately instead.
    await sleep(2000 * 2 ** (attempt - 1));
  }

  throw lastError;
}

// Google names the quota it is refusing you on, and the two it can mean want
// opposite responses. A per-MINUTE refusal is a busy moment and is worth
// coming back for in two minutes. A per-DAY refusal is the budget being gone
// until midnight, and every retry before then is guaranteed to fail.
const PER_DAY_QUOTA = /PerDay|GenerateRequestsPerDayPerProjectPerModel/i;

// Every model in turn, but only while the reason to move on is that the
// previous one is out of requests for today. A 400 is the request being wrong
// and would be wrong at the next model too; a 503 has already been waited out
// inside callModel. Only a 429 is worth someone else's allowance.
//
// When the LAST model also refuses on a per-day quota, there is no allowance
// left anywhere on this key, and the error says so -- `quotaExhausted` is what
// lets a queue wait for the reset instead of spending its eight attempts in
// the next four hours against a window that does not open until midnight.
// That distinction is the whole difference between an import that finishes
// overnight and one that marks most of itself failed while you sleep.
async function callGemini(body) {
  let lastError;
  let everyModelOutOfRequests = true;

  for (const model of GEMINI_MODELS) {
    try {
      const text = await callModel(model, body);
      // A call got through, so any marker written earlier is stale.
      clearQuotaMark();
      return text;
    } catch (err) {
      lastError = err;
      if (err.status !== 429) throw err;
      if (!PER_DAY_QUOTA.test(err.message)) everyModelOutOfRequests = false;
      console.error(`Gemini: ${model} is out of requests for today, trying the next model`);
    }
  }

  if (everyModelOutOfRequests) {
    lastError.quotaExhausted = true;
    const until = await markQuotaExhausted();
    console.error(`Gemini: no requests left on any model until ${until.toISOString()}`);
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
  return (await fetchImage(imageUrl)).toString("base64");
}

// `images` is one page, in reading order, as one or more sections. They go in
// a single request, so the cost in the only currency that is scarce here --
// requests per day -- is the same whether there is one of them or six.
async function callGeminiVision({ prompt, images }) {
  const text = await callGemini({
    contents: [
      {
        parts: [
          { text: prompt },
          ...images.map(({ mimeType, data }) => ({ inlineData: { mimeType, data } })),
        ],
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
  // The pictures and the markup answer different questions, so both go in.
  // One HTTP GET, no model cost, and a null result costs nothing either.
  const [images, structure] = await Promise.all([
    toImageParts(await fetchImage(screenshotUrl)),
    readPageStructure(url),
  ]);

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
     - primary: the pages the site is built to send you to — the main product or service landing page, pricing, the principal solution page. If there are several product or service landing pages, pick the single most prominent one and make only that one primary. A store's product archive and one product detail page are primary; the other forty products are not.
     - secondary: the supporting pages a visitor reaches when they want more — about, FAQ, blog index, careers, contact, a demo request, docs home.
     - tertiary: an individual instance rather than a template — one blog post, one case study, one job listing, one FAQ entry.
     An index and one of its entries are never the same tier: a blog index is secondary and a single post is tertiary.
   - page_type must be one of: ${vocabulary.page_type.join(", ")} — or null if none fit.
   - utility_label: the page's FUNCTION, in 1-3 words, Title Case. Never its subject. Apple's /iphone page is "Product Landing", not "iPhone"; a page about one running shoe is "Product Detail", not "Pegasus 41". Someone searching this library later is looking for a kind of page to study, not for that company's product.
     Use one of these wherever it fits, so the same page is called the same thing on every site: Product Landing, Product Detail, Product Archive, Service Landing, Pricing, About Us, Contact, Request A Demo, Blog Index, Blog Post, Case Study, Case Study Index, Docs, Careers, Integrations, FAQ, Support, Changelog, Login, Legal.
     Only invent a label when none of those describe it, and keep it just as generic.
   - Do NOT include the homepage. It's already known and shown separately.

Links found:
${discoveredPages.map((p) => `- ${p.url} ("${p.label}")`).join("\n")}`
    : "";

  const prompt = `You are cataloguing a screenshot of the homepage of "${name || domain}" (${url}) for a personal design-inspiration library.

${describeStructure(structure)}

${
    images.length > 1
      ? `The ${images.length} attached images are consecutive vertical sections of ONE page, in order from the top. They overlap slightly, so a section appearing at the bottom of one image and the top of the next is one section, not two. Read them as a single page: it has one navigation, one hero and one footer in total, not one per image.`
      : `Look at the attached full-page screenshot.`
  }

Do the following:

1. Write a 3-5 sentence summary of the page for a UI/product designer: what it's for, and notably how it's designed (layout, structure, standout patterns).
2. Pick tags from these four closed lists. Only use these exact values, never invent your own spelling or new values in this step:
   - vertical (1-2): ${vocabulary.vertical.join(", ")}
   - page_type (1-2): ${vocabulary.page_type.join(", ")}
     What you are looking at is a site's homepage unless it plainly isn't, so "homepage" is usually the right answer. Reserve "landing" for a page built for one campaign, product or audience that is not the site's front door.
   - aesthetic (1-2): ${vocabulary.aesthetic.join(", ")}
   - block_pattern (up to 8): ${vocabulary.block_pattern.join(", ")}
   If truly nothing in a list fits, return an empty array for that facet rather than forcing a bad match.

   block_pattern is an inventory of the distinct KINDS of section on the page, not a list of every section. Work down the page from top to bottom, and return each value at most once -- three card grids in a row are still Card Grid, once. Most pages have five or more distinct kinds.

   The values are written family-then-variety -- Hero Carousel, Logo Strip, Text Rows, Footer Minimal -- and the variety is the part that matters. Every site on the internet has a hero, a nav and a footer, so a tag that says only which family it belongs to matches everything and finds nothing. Pick the value that says how THIS one differs:
   - Look for what carries the block: type, a photograph, video, a product shot, a logo lockup, numbers, a form.
   - Look for how it is laid out: centred, split, side by side, in columns, in a grid, full bleed, framed.
   - Look for whether it moves, and look hard, because the screenshot is taken with animation frozen and a carousel mid-slide looks exactly like a static block. The tells are small: arrows, dots, a row of short dashes with one highlighted, a numeral like "01/04", an item cut off at the right edge, or a heading that promises more than the one thing shown. If the code evidence below says a slider is loaded, believe it over the stillness of the picture. A row of logos sitting still is Logo Strip; the same row driven by a slider is Logo Carousel, and those are different findings.
   - Tabs can sit anywhere. Labels above the panel are Tab Top, labels down one side are Tab Side, and labels along the BOTTOM of the panel are Tab Bottom -- which is easy to miss, because at a glance they read as a caption or a footnote rather than as controls.

   Worked example, so the level of detail is clear. A page opens with a full-width photograph that cycles behind the headline: Hero Carousel. Under it a single large paragraph introducing the company: Text Lead. Then a row of client marks with arrows: Logo Carousel. Then three linked cards: Card Grid. Then a section whose panels change as you press labels along the bottom: Tab Top. Then alternating rows of heading-and-paragraph: Text Rows. Then a closing panel with one button: CTA Standard. Then a short footer of a few links and a mark: Footer Minimal.

   Always include one hero variety and one footer variety unless the screenshot is genuinely cut off before them. A short footer of a few links and a logo is Footer Minimal, which is a finding worth recording rather than a reason to leave it out. The navigation is only worth recording when it is a distinct kind -- Nav Mega, Nav Sidebar, Nav Sticky. An ordinary header bar is Nav Simple and is the one case where you may leave it out.
3. Optionally, if you think there's a real pattern on this page that none of the block_pattern or aesthetic values above describe, propose exactly ONE new tag as {facet, label}. Only do this if it's a genuinely distinct, reusable concept — not a rewording of an existing tag. Otherwise set proposed_tag to null.

${!name ? `This site had no clean title available — also propose a short, clean display name for it (1-4 words) in the "name" field.` : `Set "name" to null, we already have a good name.`}${pagesBlock}`;

  return callGeminiVision({ prompt, images });
}

// A component is a cropped-out region of a page (a hero, a pricing table,
// whatever the owner drew a box around) rather than a full-page screenshot.
export async function enrichComponent({ sourceUrl, imageBase64, vocabulary }) {
  // A crop is one block, so it is nearly always a single part -- toImageParts
  // only cuts what is more than twice as tall as it is wide, and a crop that
  // tall is a page someone drew a box around.
  const images = await toImageParts(Buffer.from(imageBase64, "base64"));
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

  return callGeminiVision({ prompt, images });
}

const RESOURCE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", nullable: true },
    summary: { type: "STRING" },
    tags: {
      type: "OBJECT",
      properties: {
        resource_type: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["resource_type"],
    },
    proposed_tag: {
      type: "OBJECT",
      nullable: true,
      properties: {
        label: { type: "STRING" },
      },
    },
  },
  required: ["summary", "tags"],
};

// A resource is a tool or reference saved for what it does, not for how it
// looks -- an icon set, a stock library, an AI product. There is no screenshot
// to attach and nothing visual to judge, so this is the one text-only
// enrichment in the app: no image fetch, no vision call, a couple of seconds
// instead of the better part of a minute.
//
// `types` is the account's live resource_type vocabulary, read fresh from the
// database like every other facet, so renaming or deleting one immediately
// changes what may be picked next.
export async function describeResource({ url, domain, title, description, textSnippet, types }) {
  const prompt = `You are cataloguing a web tool or resource for a designer's personal library. This is NOT being saved for its visual design — it's saved because of what it does or provides.

URL: ${url}
Domain: ${domain}
Page title: ${title || "(none)"}
Meta description: ${description || "(none)"}
Visible text from the page:
${textSnippet || "(none available)"}

Do three things:

1. Write a summary of ONE OR TWO sentences saying what this is and what a designer would use it for. Be concrete and practical — "An open-source icon set of 1,500+ MIT-licensed SVG icons, forked from Feather" beats "A beautiful collection of icons for modern interfaces". Never describe how the page looks; nobody saved it for that. If the page is plainly a single article rather than a tool, summarise what it argues.

2. Pick 1-2 tags from this closed list, using these exact values and inventing nothing: ${types.join(", ")}
   Pick the one a person would reach for when hunting this back down months later. Prefer one confident tag over two loose ones, and return an empty array rather than forcing a bad match.

3. ONLY IF you returned an empty array in step 2, propose exactly one new type as {label}: a reusable category in Title Case, not a one-off description of this single tool. If you picked any tag at all in step 2, set proposed_tag to null — a second word for a thing you have already named is not a new category.

${title ? 'Set "title" to null, we already have a usable one.' : 'Also propose a short, clean display title (1-4 words) in the "title" field — the name of the tool, not a sentence about it.'}`;

  const text = await callGemini({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESOURCE_SCHEMA,
    },
  });
  return JSON.parse(text);
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
export async function identifyFonts({ domain, fonts, fontHosts = [], probes = {} }) {
  // One part per typeface, each line immediately followed by that face's own
  // letterforms, so there is no ambiguity about which image belongs to which
  // name. Without the images this call is guessing from a CSS string, and it
  // guesses the way the string reads: "Exact Block" was called a heavy
  // geometric display and matched to Syne, when it is a high-contrast serif
  // whose own fallback stack is Georgia and Times.
  const parts = [];
  for (const f of fonts) {
    parts.push({
      text: `\nCSS family "${f.family}"${
        f.source_host ? `, served from ${f.source_host}` : ""
      }, ${Math.round(f.share * 100)}% of the page's text, largest size seen ${f.max_size}px, ${
        probes[f.family] ? "letterforms below" : "no rendering available"
      }.`,
    });
    const probe = probes[f.family];
    if (probe) {
      parts.push({ inlineData: { mimeType: "image/png", data: probe.replace(/^data:image\/png;base64,/, "") } });
    }
  }

  const prompt = `These typefaces were measured rendering on the website ${domain}. Each is listed below with its CSS family name, and most are followed by an image of that exact face rendered off the live page.

The CSS names come from build pipelines, so many are slugs or internal names and some actively mislead: a name containing "Block", "Sans" or "Display" tells you nothing reliable about the letterforms. Where an image is present it is the ground truth. Judge the design from the image and use the name only as a clue to what it is called.
${fontHosts.length ? `\nFont files on this page were served from: ${fontHosts.join(", ")}.` : ""}

For each one, return:
- family: the CSS name exactly as given above, so I can match your answer back.
- display_name: the typeface's real, correctly spelled name ("sohne" is Söhne, "SuisseIntl" is Suisse Int'l). If the CSS name is already the real name, repeat it.
- foundry: the type foundry or designer that released it (e.g. Klim Type Foundry, Swiss Typefaces, Commercial Type). Null if you genuinely don't know — never guess.
- foundry_url: the URL of that typeface's own page on the foundry's site, or the foundry's homepage if you're unsure of the deeper link. Null if you don't know one.
- classification: a short description a designer would use, taken from what you can see: "high-contrast serif", "neo-grotesque sans", "transitional serif", "geometric sans", "monospace".
- is_custom: true only if this face was drawn exclusively for this brand and isn't licensable by anyone else.
- google_match / google_note: the nearest equivalent on Google Fonts, and a 6-12 word note on what makes it near (proportions, contrast, terminals, x-height, mood).
- adobe_match / adobe_slug / adobe_note: the same for Adobe Fonts, plus the slug from its Adobe Fonts URL (fonts.adobe.com/fonts/SLUG).

Two rules about matches, and the first one outranks the second.

Never cross species. A serif must be matched to a serif, a sans to a sans, a monospace to a monospace — and stay in the same broad temperament too: don't answer a high-contrast serif with a slab, or a neutral grotesque with a quirky display face. A match in the wrong species is worse than no match at all, because it sends someone to look at something that could never stand in.

Otherwise, prefer a loose match to nothing. A designer would rather see the nearest available relative and be told the resemblance is approximate than see an empty space, so reach for the closest thing in the right species and say plainly in the note how near it is. Return null only when you cannot name anything on that service in the same species, or when this typeface is itself on that service.`;

  const text = await callGemini({
    contents: [{ parts: [{ text: prompt }, ...parts] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: FONT_SCHEMA },
  });
  return JSON.parse(text);
}
