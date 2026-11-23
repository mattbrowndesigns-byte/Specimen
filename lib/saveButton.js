// The bookmark that reads a page from inside it, for sites that won't let
// Kivli's own reader in. It runs in the visitor's tab, where the page is
// already open, writes down where its pictures and clips are, and opens Kivli
// with the list. The files themselves are fetched by the server afterwards.
//
// The list travels in the address's fragment, which is never sent to a server
// and which a page can't block: a request or a script tag would be refused by
// many sites' security policies, and a message to the new tab by others.
//
// The tab's own title comes before the share title: Motto's Maisa page shares
// itself as Goodnotes. Pictures in the menu or linking elsewhere go last, so
// they are what a long page loses.
//
// It is a string rather than a function because a bundler would rewrite a
// function to lean on helpers that don't exist on someone else's page. Plain
// statements, no line comments: it is folded onto one line. The code is copied
// into the bookmark, so a change here reaches only buttons added after it; the
// `v` in the payload is there for that.
const SOURCE = String.raw`
(function () {
  var origin = __ORIGIN__, key = __KEY__;
  var host = location.hostname.replace(/^www\./, '');
  var posts = /(^|\.)(instagram\.com|x\.com|twitter\.com|linkedin\.com|threads\.(net|com))$/.test(host);
  var q = function (s, r) { return (r || document).querySelector(s); };
  var all = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var root = (posts && (q('[role=dialog] article') || q('main article') || q('article') || q('main'))) || document.body;
  var abs = function (u) {
    if (!u) return null;
    try {
      u = new URL(String(u).trim(), document.baseURI);
      return /^https?:$/.test(u.protocol) ? u.href : null;
    } catch (e) { return null; }
  };
  var largest = function (set) {
    var best = null;
    String(set || '').split(/,\s+(?=\S)/).forEach(function (entry) {
      var bits = entry.trim().split(/\s+/), url = bits[0] && abs(bits[0]), size = bits[1] || '1x';
      var n = (parseFloat(size) || 1) * (/w$/.test(size) ? 1 : 1000);
      if (url && (!best || n > best.n)) best = { u: url, n: n };
    });
    return best && best.u;
  };
  var order = new Map();
  all('*').forEach(function (el, i) { order.set(el, i); });
  var squash = function (t) { return String(t || '').replace(/\s+/g, ' ').trim(); };
  var about = function (el) {
    var out = { o: order.get(el) };
    if (el.closest('header,nav,footer,[role=banner],[role=contentinfo],[role=navigation]') && !posts) out.c = 1;
    var a = el.closest('a[href]'), link = a && abs(a.getAttribute('href'));
    if (link && !/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(link)) {
      link = new URL(link);
      if (link.pathname !== location.pathname) out.l = link.host === location.host ? link.pathname : link.host;
    }
    var node = el.parentElement;
    for (var i = 0; i < 5 && node && !out.h; i++, node = node.parentElement) {
      var h = q('h1,h2,h3,h4', node), t = h && squash(h.textContent);
      if (t) out.h = t.slice(0, 80);
    }
    var alt = squash(el.getAttribute('alt'));
    if (alt) out.a = alt.slice(0, 140);
    return out;
  };
  var seen = {}, images = [], videos = [];
  var add = function (list, url, el, extra) {
    if (!url || seen[url] || url.length > 2000) return;
    seen[url] = 1;
    list.push(Object.assign({ u: url }, about(el), extra || {}));
  };
  all('video', root).forEach(function (v) {
    var urls = [];
    [v].concat(all('source', v)).forEach(function (el) {
      [].slice.call(el.attributes).forEach(function (at) {
        if (at.name !== 'poster' && /^[^\s"{}]+\.(mp4|m4v)\b/i.test(at.value)) urls.push(abs(at.value));
      });
    });
    if (v.currentSrc) urls.push(abs(v.currentSrc));
    var url = urls.filter(function (u) { return u && !/\.(webm|m3u8|mpd|mov|ogv)(\?|#|$)/i.test(u); })[0];
    var poster = abs(v.getAttribute('poster') || v.getAttribute('data-poster'));
    if (url) add(videos, url, v, poster ? { p: poster } : null);
    else if (poster) add(images, poster, v);
    if (poster) seen[poster] = 1;
  });
  all('img', root).forEach(function (img) {
    var set = largest(img.getAttribute('data-srcset')) || largest(img.getAttribute('srcset'));
    if (img.parentElement && img.parentElement.tagName === 'PICTURE') {
      all('source', img.parentElement).forEach(function (s) {
        set = set || largest(s.getAttribute('data-srcset')) || largest(s.getAttribute('srcset'));
      });
    }
    if (!set && img.naturalWidth && Math.min(img.naturalWidth, img.naturalHeight) < 200) return;
    var lazy = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-image', 'data-delayed-url']
      .map(function (n) { return img.getAttribute(n); }).filter(Boolean)[0];
    var url = set || (lazy && abs(lazy)) || abs(img.currentSrc || img.src);
    if (url && !/\.(svg|ico)(\?|#|$)/i.test(url)) add(images, url, img);
  });
  all('*', root).slice(0, 6000).forEach(function (el) {
    var bg = getComputedStyle(el).backgroundImage, m = bg && /url\("?(https?:[^")]+)"?\)/.exec(bg);
    if (!m || /\.(svg|ico)(\?|#|$)/i.test(m[1])) return;
    var box = el.getBoundingClientRect();
    if (box.width >= 300 && box.height >= 200) add(images, m[1], el);
  });
  var meta = function (n) { var el = q('meta[property="' + n + '"],meta[name="' + n + '"]'); return el ? squash(el.content).slice(0, 600) : ''; };
  var by = null;
  all('script[type="application/ld+json"]').some(function (s) {
    try {
      return [].concat(JSON.parse(s.textContent)).some(function (d) {
        return [].concat((d && d['@graph']) || d).some(function (x) {
          var who = x && [].concat(x.creator || x.author || [])[0];
          var name = who && squash(typeof who === 'string' ? who : who.name);
          if (name) by = { n: name.slice(0, 120), u: abs(who.url) };
          return Boolean(name);
        });
      });
    } catch (e) { return false; }
  });
  if (!by) {
    var person = posts
      ? q('header a[href^="/"]', root)
      : q('a[rel~=author],a[class*=Owner][href],a[class*=owner][href],a[class*=UserInfo][href],[class*=user-details] a[href]');
    var called = person && squash(person.textContent);
    if (called && called.length < 60) by = { n: called, u: abs(person.getAttribute('href')) };
  }
  var work = function (a, b) { return Boolean(a.l || a.c) - Boolean(b.l || b.c) || a.o - b.o; };
  var icon = q('link[rel~=icon]');
  var payload = {
    v: 1, k: key, url: location.href.split('#')[0],
    title: squash(document.title).slice(0, 300) || meta('og:title'),
    site: meta('og:site_name'), text: meta('og:description'),
    icon: icon ? icon.href : null, by: by,
    images: images.sort(work).slice(0, 60), videos: videos.sort(work).slice(0, 12)
  };
  if (!payload.images.length && !payload.videos.length) {
    alert('Kivli found no images or videos on this page.');
    return;
  }
  var to = origin + '/save#' + encodeURIComponent(JSON.stringify(payload));
  if (!window.open(to, '_blank')) location.href = to;
})();
`;

export function saveButtonHref(origin, key) {
  const code = SOURCE.replace("__ORIGIN__", JSON.stringify(origin))
    .replace("__KEY__", JSON.stringify(key))
    .replace(/\n\s*/g, " ")
    .trim();
  return `javascript:${encodeURIComponent(code)}`;
}
