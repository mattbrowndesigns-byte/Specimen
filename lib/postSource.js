import { UA } from "@/lib/pageMeta";
import { handleFromUrl, platformOf } from "@/lib/platforms";

// A social post, read as a post: who made it, what they said, and which of
// the pictures and clips on the page are theirs. Nothing here needs an
// account or a key -- it is what each platform already says to anyone.

// Sharing from an app hands over a short link, which names neither the person
// nor the platform.
const SHORT_HOSTS = new Set(["lnkd.in", "t.co", "pin.it", "vm.tiktok.com", "vt.tiktok.com", "bit.ly", "fb.watch"]);
const MAX_HOPS = 4;

const hostOf = (url) => new URL(url).hostname.toLowerCase().replace(/^www\./, "");

// The post's own address: short links followed, tracking dropped. LinkedIn's
// share links carry a parameter naming who copied them, which has no business
// in a library that can be shared. Anything that isn't a post or a short link
// comes back exactly as it was, and any failure leaves the address alone.
export async function resolvePostUrl(url) {
  let current = url;
  try {
    for (let hop = 0; hop < MAX_HOPS && SHORT_HOSTS.has(hostOf(current)); hop += 1) {
      const res = await fetch(current, {
        redirect: "manual",
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(6000),
      });
      const location = res.headers.get("location");
      if (!location) break;
      const next = new URL(location, current);
      if (next.protocol !== "http:" && next.protocol !== "https:") break;
      current = next.toString();
    }
    if (platformOf(current)?.bare) {
      const u = new URL(current);
      u.search = "";
      u.hash = "";
      u.pathname = u.pathname.replace(/\/+$/, "") || "/";
      current = u.toString();
    }
    return current;
  } catch {
    return current;
  }
}

const squash = (value) => String(value || "").replace(/\s+/g, " ").trim();

const httpUrl = (value) => (/^https?:\/\//i.test(value || "") ? value : null);

// LinkedIn hands out profile links on the reader's country, "ca.linkedin.com",
// for everyone.
const profileUrl = (value) => httpUrl(value)?.replace(/^https?:\/\/[a-z]{2}\.linkedin\.com\//i, "https://www.linkedin.com/") || null;

// Every JSON-LD object on the page, graphs unrolled.
function jsonLd($) {
  const out = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      for (const item of [].concat(data)) out.push(...(Array.isArray(item?.["@graph"]) ? item["@graph"] : [item]));
    } catch {
      // Somebody's broken markup isn't a reason to lose the post.
    }
  });
  return out.filter((d) => d && typeof d === "object");
}

// The post's author. Comments carry authors too, but nested inside the post,
// so only the top of each object is asked.
function creatorFrom($, url) {
  for (const item of jsonLd($)) {
    const who = [].concat(item.creator || item.author || [])[0];
    const name = squash(typeof who === "string" ? who : who?.name);
    if (name) return { name, url: profileUrl(who?.url) || handleFromUrl(url)?.url || null };
  }
  const meta = squash($('meta[name="author"]').attr("content"));
  if (meta && meta.length < 60) return { name: meta, url: handleFromUrl(url)?.url || null };
  // "Bluesky (@bsky.app)", "jack (@jack) on X".
  const og = squash($('meta[property="og:title"]').attr("content"));
  const named = /^(.{1,50}?) \(@[^)]+\)/.exec(og)?.[1];
  const handle = handleFromUrl(url);
  if (named) return { name: named, url: handle?.url || null };
  return handle;
}

// LinkedIn's signed-out page is the post, then other people's posts under
// "explore related". Everything outside the first one is removed before the
// images are read, or a stranger's work would be saved under this person's
// name. Profile pictures and banners go too.
function scopeLinkedIn($) {
  const post = $("article.main-feed-activity-card").first();
  if (!post.length) return;
  $("body").html($.html(post));
  $("section.comment, img[class*=entity__image]").remove();
  $("img").each((_, el) => {
    const src = $(el).attr("data-delayed-url") || $(el).attr("src") || "";
    if (/profile-display|static\.licdn\.com/.test(src)) return void $(el).remove();
    $(el).attr("data-src", src);
    // Its alt is boilerplate or the first words of the post.
    if (/^(no alternative text|graphical user interface)/i.test($(el).attr("alt") || "")) $(el).removeAttr("alt");
  });
  $("video[data-sources]").each((_, el) => {
    const best = bestMp4($(el).attr("data-sources"));
    if (best) $(el).attr("src", best);
    const poster = $(el).attr("data-poster-url");
    if (poster) $(el).attr("poster", poster);
  });
}

// The largest rendition is first choice, and LinkedIn's largest is 720p.
function bestMp4(json) {
  try {
    return JSON.parse(json)
      .filter((s) => /mp4/i.test(s.type || "") && httpUrl(s.src))
      .sort((a, b) => (b["data-bitrate"] || 0) - (a["data-bitrate"] || 0))[0]?.src;
  } catch {
    return null;
  }
}

// What a post says, for the model: a signed-out page carries it whole.
function textFrom($) {
  for (const item of jsonLd($)) {
    const text = squash(item.articleBody || item.description || item.headline);
    if (text) return text.slice(0, 600);
  }
  return squash($('meta[property="og:description"]').attr("content")).slice(0, 600) || null;
}

// Reads a post out of a loaded page and narrows `$` to it. Null off-platform.
export function readPost($, url) {
  const platform = platformOf(url);
  if (!platform) return null;
  const post = { platform, creator: creatorFrom($, url), text: textFrom($) };
  if (platform.id === "linkedin") scopeLinkedIn($);
  return post;
}

// X's page is an app with nothing in it; the endpoint its own embeds read has
// the author and every picture and clip.
export async function fetchXPost(url) {
  const id = /\/status\/(\d+)/.exec(new URL(url).pathname)?.[1];
  if (!id) return null;
  const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
  const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${token}&lang=en`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  const tweet = res?.ok ? await res.json().catch(() => null) : null;
  if (!tweet?.user) return null;

  const text = squash(tweet.text);
  const base = { inChrome: false, linkedTo: null, heading: null, alt: null };
  const found = [];
  const videos = [];
  (tweet.mediaDetails || []).forEach((m, order) => {
    if (m.type === "photo") {
      found.push({ ...base, alt: squash(m.ext_alt_text) || null, sourceUrl: `${m.media_url_https}?name=orig`, order });
      return;
    }
    const best = (m.video_info?.variants || [])
      .filter((v) => v.content_type === "video/mp4")
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    // The 1080p rendition is often over the size a loop may be; 720p is what
    // a library needs.
    const pick = best.find((v) => (v.bitrate || 0) <= 2500000) || best[best.length - 1];
    if (pick) videos.push({ ...base, sourceUrl: pick.url, posterUrl: m.media_url_https, order });
  });
  return {
    creator: { name: squash(tweet.user.name) || `@${tweet.user.screen_name}`, url: `https://x.com/${tweet.user.screen_name}` },
    text,
    found,
    videos,
  };
}

