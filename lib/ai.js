const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function callGemini(body) {
  const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini request failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");
  return text;
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
  },
  required: ["summary", "tags"],
};

async function imageToBase64(imageUrl) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch screenshot: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

// vocabulary: { vertical: string[], page_type: string[], block_pattern: string[], aesthetic: string[] }
// (current is_approved slugs per facet, read fresh from the DB so tag-management edits take effect immediately)
export async function enrichSite({ name, domain, url, screenshotUrl, vocabulary }) {
  const imageBase64 = await imageToBase64(screenshotUrl);

  const prompt = `You are cataloguing a screenshot of the homepage of "${name || domain}" (${url}) for a personal design-inspiration library.

Look at the attached full-page screenshot and do three things:

1. Write a 3-5 sentence summary of the page for a UI/product designer: what it's for, and notably how it's designed (layout, structure, standout patterns).
2. Pick 1-2 tags from EACH of these four closed lists that best describe this page. Only use these exact values, never invent your own spelling or new values in this step:
   - vertical: ${vocabulary.vertical.join(", ")}
   - page_type: ${vocabulary.page_type.join(", ")}
   - block_pattern: ${vocabulary.block_pattern.join(", ")}
   - aesthetic: ${vocabulary.aesthetic.join(", ")}
   If truly nothing in a list fits, return an empty array for that facet rather than forcing a bad match.
3. Optionally, if you think there's a real pattern on this page that none of the block_pattern or aesthetic values above describe, propose exactly ONE new tag as {facet, label}. Only do this if it's a genuinely distinct, reusable concept — not a rewording of an existing tag. Otherwise set proposed_tag to null.

${!name ? `This site had no clean title available — also propose a short, clean display name for it (1-4 words) in the "name" field. ` : `Set "name" to null, we already have a good name.`}`;

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
