// Writes down where the open page's pictures and clips are. Runs inside the
// page (chrome.scripting.executeScript), only when Visual is chosen, and
// touches nothing there. The files are fetched by Kivli afterwards.
//
// It has to stand on its own: Chrome sends this one function's source to the
// page, so nothing outside it exists when it runs.
//
// The tab's own title comes before the share title: Motto's Maisa page shares
// itself as Goodnotes. Pictures in the menu or linking elsewhere go last.
export function readPage() {
  const MAX_IMAGES = 40;
  const MAX_VIDEOS = 12;
  // What Kivli turns away from a page it reads itself, so nothing is offered
  // that would be refused.
  const MIN_SHORT = 300;
  const MIN_LONG = 500;

  const host = location.hostname.replace(/^www\./, "");
  const isPost = /(^|\.)(instagram\.com|x\.com|twitter\.com|linkedin\.com|threads\.(net|com)|bsky\.app)$/.test(host);
  const q = (s, root = document) => root.querySelector(s);
  const all = (s, root = document) => [...root.querySelectorAll(s)];
  const article = isPost && (q("[role=dialog] article") || q("main article") || q("article"));
  const root = article || (isPost && q("main")) || document.body;
  const squash = (t) => String(t || "").replace(/\s+/g, " ").trim();

  const abs = (raw) => {
    if (!raw) return null;
    try {
      const u = new URL(String(raw).trim(), document.baseURI);
      if (!/^https?:$/.test(u.protocol)) return null;
      // X serves a size by name, and the one on the page is a small one.
      if (u.hostname === "pbs.twimg.com" && u.searchParams.has("name")) u.searchParams.set("name", "large");
      return u.href;
    } catch {
      return null;
    }
  };

  // The largest entry in a srcset, and the width it claims.
  const largest = (set) => {
    let best = null;
    for (const entry of String(set || "").split(/,\s+(?=\S)/)) {
      const [raw, size = "1x"] = entry.trim().split(/\s+/);
      const url = raw && abs(raw);
      if (!url) continue;
      const wide = /w$/.test(size);
      const n = (parseFloat(size) || 1) * (wide ? 1 : 1000);
      if (!best || n > best.n) best = { url, n, width: wide ? n : null };
    }
    return best;
  };

  const order = new Map();
  all("*").forEach((el, i) => order.set(el, i));

  const about = (el) => {
    const out = { o: order.get(el) };
    if (!isPost && el.closest("header,nav,footer,[role=banner],[role=contentinfo],[role=navigation]")) out.c = 1;
    const a = el.closest("a[href]");
    const link = a && abs(a.getAttribute("href"));
    if (link && !/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(link)) {
      const to = new URL(link);
      const here = location.pathname.replace(/\/$/, "");
      const within =
        to.host === location.host && (to.pathname === location.pathname || (here && to.pathname.startsWith(`${here}/`)));
      if (!within) out.l = 1;
    }
    let node = el.parentElement;
    for (let i = 0; i < 5 && node && !out.h; i += 1, node = node.parentElement) {
      const h = q("h1,h2,h3,h4", node);
      const t = h && squash(h.textContent);
      if (t) out.h = t.slice(0, 80);
    }
    const alt = squash(el.getAttribute("alt"));
    if (alt) out.a = alt.slice(0, 140);
    return out;
  };

  const seen = new Set();
  const images = [];
  const videos = [];
  const add = (list, url, el, extra) => {
    if (!url || url.length > 2000 || seen.has(url)) return;
    seen.add(url);
    list.push({ u: url, ...about(el), ...extra });
  };
  const drawing = (url) => /\.(svg|ico)(\?|#|$)/i.test(url);

  for (const v of all("video", root)) {
    const urls = [];
    for (const el of [v, ...all("source", v)]) {
      for (const at of el.attributes) {
        if (at.name !== "poster" && /^[^\s"{}]+\.(mp4|m4v)\b/i.test(at.value)) urls.push(abs(at.value));
      }
    }
    if (v.currentSrc) urls.push(abs(v.currentSrc));
    const url = urls.find((u) => u && !/\.(webm|m3u8|mpd|mov|ogv)(\?|#|$)/i.test(u));
    const poster = abs(v.getAttribute("poster") || v.getAttribute("data-poster"));
    if (url) add(videos, url, v, { p: poster, t: poster });
    else if (poster) add(images, poster, v, { t: poster });
    // A clip's cover is the clip, not a second picture.
    if (poster) seen.add(poster);
  }

  for (const img of all("img", root)) {
    let set = largest(img.getAttribute("data-srcset")) || largest(img.getAttribute("srcset"));
    if (!set && img.parentElement?.tagName === "PICTURE") {
      for (const s of all("source", img.parentElement)) {
        set = set || largest(s.getAttribute("data-srcset")) || largest(s.getAttribute("srcset"));
      }
    }
    const lazy = ["data-src", "data-lazy-src", "data-original", "data-lazy", "data-image", "data-delayed-url"]
      .map((n) => img.getAttribute(n))
      .find(Boolean);
    const { naturalWidth: w, naturalHeight: h } = img;
    // One still waiting to load is a placeholder for now, and says nothing
    // about the picture it is holding a place for.
    if (set?.width) {
      const ratio = w && h ? Math.min(w, h) / Math.max(w, h) : 1;
      const long = h > w ? set.width / (ratio || 1) : set.width;
      if (long < MIN_LONG || (w && h && long * ratio < MIN_SHORT)) continue;
    } else if (!set && !lazy && w && (Math.min(w, h) < MIN_SHORT || Math.max(w, h) < MIN_LONG)) {
      continue;
    }
    const shown = abs(img.currentSrc || img.src);
    const url = set?.url || (lazy && abs(lazy)) || shown;
    if (url && !drawing(url)) add(images, url, img, { t: shown && w > 40 ? shown : url });
  }

  for (const el of all("*", root).slice(0, 6000)) {
    const bg = getComputedStyle(el).backgroundImage;
    const m = bg && /url\("?(https?:[^")]+)"?\)/.exec(bg);
    if (!m || drawing(m[1])) continue;
    const box = el.getBoundingClientRect();
    if (box.width >= MIN_SHORT && box.height >= 200) add(images, abs(m[1]), el, { t: m[1] });
  }

  const meta = (n) => {
    const el = q(`meta[property="${n}"],meta[name="${n}"]`);
    return el ? squash(el.content).slice(0, 600) : "";
  };

  // Who made it. On a post, only from the post itself: a feed's first name is
  // whoever happens to be at the top of it.
  let by = null;
  if (!isPost) {
    for (const s of all('script[type="application/ld+json"]')) {
      try {
        for (const d of [].concat(JSON.parse(s.textContent))) {
          for (const x of [].concat(d?.["@graph"] || d)) {
            const who = x && [].concat(x.creator || x.author || [])[0];
            const name = who && squash(typeof who === "string" ? who : who.name);
            if (name && !by) by = { n: name.slice(0, 120), u: abs(who.url) };
          }
        }
      } catch {
        // Somebody's broken markup isn't a reason to lose the page.
      }
    }
  }
  const person = isPost
    ? article && q('header a[href^="/"],[data-testid="User-Name"] a[href]', article)
    : !by && q("a[rel~=author],a[class*=Owner][href],a[class*=owner][href],a[class*=UserInfo][href],[class*=user-details] a[href]");
  const called = person && squash(person.textContent);
  if (!by && called && called.length < 60) by = { n: called, u: abs(person.getAttribute("href")) };

  const work = (a, b) => Boolean(a.l || a.c) - Boolean(b.l || b.c) || a.o - b.o;
  const icon = q("link[rel~=icon]");
  return {
    url: location.href.split("#")[0],
    title: squash(document.title).slice(0, 300) || meta("og:title"),
    site: meta("og:site_name"),
    icon: icon ? icon.href : null,
    by,
    images: images.sort(work).slice(0, MAX_IMAGES),
    videos: videos.sort(work).slice(0, MAX_VIDEOS),
  };
}
