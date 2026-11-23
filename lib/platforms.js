// The places people post work that aren't their own site. Shared by the server
// (which reads a post differently from a case study) and the browser (which
// labels the link back), so it imports nothing.
//
// On one of these the site's name is never the credit: "By LinkedIn" credits
// the noticeboard for what was pinned to it.
//
// `bare` hosts carry nothing in the query string but tracking. `handle` reads
// the person out of the address, for a platform that says nothing else.
const PLATFORMS = [
  { id: "linkedin", name: "LinkedIn", hosts: ["linkedin.com"], bare: true },
  {
    id: "x",
    name: "X",
    hosts: ["x.com", "twitter.com"],
    bare: true,
    handle: /^\/(?!i\/|home\b|search\b|explore\b)([A-Za-z0-9_]{1,15})(?:\/|$)/,
    profile: (h) => `https://x.com/${h}`,
  },
  {
    id: "instagram",
    name: "Instagram",
    hosts: ["instagram.com"],
    bare: true,
    handle: /^\/(?!p\/|reel\/|reels\/|tv\/|explore\/|stories\/)([A-Za-z0-9._]{1,30})(?:\/|$)/,
    profile: (h) => `https://www.instagram.com/${h}/`,
  },
  {
    id: "threads",
    name: "Threads",
    hosts: ["threads.net", "threads.com"],
    bare: true,
    handle: /^\/@([A-Za-z0-9._]{1,30})(?:\/|$)/,
    profile: (h) => `https://www.threads.com/@${h}`,
  },
  {
    id: "tiktok",
    name: "TikTok",
    hosts: ["tiktok.com"],
    bare: true,
    handle: /^\/@([A-Za-z0-9._]{1,30})(?:\/|$)/,
    profile: (h) => `https://www.tiktok.com/@${h}`,
  },
  {
    id: "bluesky",
    name: "Bluesky",
    hosts: ["bsky.app"],
    handle: /^\/profile\/([^/]+)/,
    profile: (h) => `https://bsky.app/profile/${h}`,
  },
  { id: "dribbble", name: "Dribbble", hosts: ["dribbble.com"] },
  { id: "behance", name: "Behance", hosts: ["behance.net"] },
  { id: "pinterest", name: "Pinterest", hosts: ["pinterest.com"] },
  { id: "facebook", name: "Facebook", hosts: ["facebook.com"] },
  { id: "youtube", name: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  { id: "vimeo", name: "Vimeo", hosts: ["vimeo.com"] },
];

export function platformOf(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  return PLATFORMS.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`))) || null;
}

// { name: "@handle", url } from the post's own address, or null.
export function handleFromUrl(url) {
  const platform = platformOf(url);
  if (!platform?.handle) return null;
  const handle = platform.handle.exec(new URL(url).pathname)?.[1];
  return handle ? { name: `@${handle}`, url: platform.profile(handle) } : null;
}

// What to call the link back to where a visual came from.
export function sourceLabel(url) {
  const platform = platformOf(url);
  return platform ? `${platform.name} post` : "Source page";
}
