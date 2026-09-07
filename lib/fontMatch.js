import { identifyFonts } from "@/lib/ai";

// Where a font file came from tells you what kind of font it is before anyone
// has to name it: Google's CDN means it's free and on Google Fonts, Typekit's
// means an Adobe subscription, anything else means the site licensed or
// commissioned it.
const PROVIDER_HOSTS = [
  [/(^|\.)gstatic\.com$/i, "google"],
  [/(^|\.)fonts\.googleapis\.com$/i, "google"],
  [/(^|\.)typekit\.net$/i, "adobe"],
  [/(^|\.)use\.typekit\.com$/i, "adobe"],
  [/(^|\.)fontshare\.com$/i, "fontshare"],
  [/(^|\.)fonts\.bunny\.net$/i, "google"],
];

function providerFor(host) {
  if (!host) return null;
  for (const [pattern, name] of PROVIDER_HOSTS) if (pattern.test(host)) return name;
  return "self-hosted";
}

// A link nobody checked is a link that eventually 404s in front of you. Both
// font services answer a real 404 for a name they don't have, so asking is
// cheap and settles it -- which is what lets the model suggest freely.
// A foundry runs its own site on its own hardware and is slower to answer than
// a font CDN, so it gets the longer budget. All three checks run in parallel,
// so the slowest one sets the cost rather than the sum.
const CDN_TIMEOUT = 4000;
const FOUNDRY_TIMEOUT = 8000;

async function resolves(url, timeout = CDN_TIMEOUT) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // A bare fetch gets a bot page from some foundry sites; this is the
        // same UA family the rest of the app uses.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

const googleUrl = (family) =>
  `https://fonts.google.com/specimen/${encodeURIComponent(family).replace(/%20/g, "+")}`;

const slugify = (name) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Adobe's slugs mostly follow the name, but not always -- "Neue Haas Grotesk"
// lives at neue-haas-grotesk-display. Try the model's slug first, then the
// obvious one, then the two suffixes Adobe uses for optical sizes.
function adobeCandidates(family, suggestedSlug) {
  const base = slugify(family);
  return [...new Set([suggestedSlug, base, `${base}-display`].filter(Boolean))].map((slug) => ({
    slug,
    url: `https://fonts.adobe.com/fonts/${slug}`,
  }));
}

// All candidates at once, then the first hit in preference order. A loop that
// awaited each in turn cost the *sum* of its misses -- three Adobe slugs at
// four seconds each, twice over for a face with no match, which is how one
// site with three custom typefaces ran a 60-second function out of budget.
async function firstResolving(candidates) {
  const checked = await Promise.all(
    candidates.map(async (candidate) => ((await resolves(candidate.url)) ? candidate : null))
  );
  return checked.find(Boolean) || null;
}

// Takes the raw measurement from analyze.js and returns the font rows to store:
// the same faces, with a real name, a foundry, and checked links to the nearest
// Google and Adobe equivalents.
//
// Every step degrades rather than throws. A font panel with names and no links
// is still worth reading; a failed Gemini call still leaves the measured
// families and their shares on the page.
export async function describeFonts({ domain, fonts, fontHosts = [] }) {
  if (!fonts?.length) return [];

  // `described` records that this pass ran, which the panel needs in order to
  // tell "we checked Google and Adobe and there's nothing close" from "nobody
  // has checked yet". Set on every row this function returns, including the
  // ones the model declined to name -- looking and finding nothing is still
  // looking. The analyze callback stores the measurement before calling this,
  // so a row without the flag is a reading whose naming pass never finished.
  const base = fonts.map((f) => ({
    ...f,
    described: true,
    provider: providerFor(f.source_host) || providerFor(fontHosts[0]) || null,
  }));

  let identified = [];
  try {
    const result = await identifyFonts({ domain, fonts, fontHosts });
    identified = Array.isArray(result.fonts) ? result.fonts : [];
  } catch (err) {
    console.error("Font identification failed:", err.message);
    return base;
  }

  const byFamily = new Map(identified.map((row) => [row.family, row]));

  return Promise.all(
    base.map(async (font) => {
      const said = byFamily.get(font.family);
      if (!said) return font;

      const row = {
        ...font,
        display_name: said.display_name || font.family,
        foundry: said.foundry || null,
        classification: said.classification || null,
        is_custom: Boolean(said.is_custom),
      };

      // A typeface that lives on one of these services doesn't need a
      // substitute for it -- it needs a link to itself there. That's true even
      // when the site self-hosts the file, which is how half the web serves
      // Inter: the model rightly proposes no Google match for a Google font,
      // and without this fallback that font would end up with no link at all.
      async function onGoogle() {
        if (said.google_match) {
          const url = googleUrl(said.google_match);
          if (await resolves(url)) return { family: said.google_match, url, note: said.google_note || null };
        }
        const own = googleUrl(row.display_name);
        if (await resolves(own)) return { family: row.display_name, url: own, self: true };
        return null;
      }

      async function onAdobe() {
        if (said.adobe_match) {
          const hit = await firstResolving(adobeCandidates(said.adobe_match, said.adobe_slug));
          if (hit) return { family: said.adobe_match, url: hit.url, note: said.adobe_note || null };
        }
        const own = await firstResolving(adobeCandidates(row.display_name, null));
        if (own) return { family: row.display_name, url: own.url, self: true };
        return null;
      }

      const [foundryOk, google, adobe] = await Promise.all([
        said.foundry_url ? resolves(said.foundry_url, FOUNDRY_TIMEOUT) : false,
        onGoogle(),
        onAdobe(),
      ]);

      if (foundryOk) row.foundry_url = said.foundry_url;
      if (google) row.google = google;
      if (adobe) row.adobe = adobe;

      return row;
    })
  );
}
