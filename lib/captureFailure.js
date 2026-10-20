// Turns the runner's failure message into a sentence worth reading.
//
// capture.js throws Playwright's own errors, which are written for whoever is
// debugging Playwright. "page.addStyleTag: Applying inline style violates the
// following Content Security Policy directive 'style-src 'self'
// https://f.vimeocdn.com'" is a true and complete account of what happened and
// tells the person who saved the link nothing they can act on.
//
// The mapping lives here rather than in scripts/deliver-capture.js for two
// reasons: the runner should stay dumb and send what it saw, and the wording
// can then be improved without a workflow run.
//
// Order matters. The first pattern that matches wins, so the specific ones
// come before the general ones.
const CAUSES = [
  [
    /Content Security Policy|addStyleTag/i,
    "This site's security policy blocked part of the capture. Kivli works around that now, so this one is worth trying again.",
  ],
  [
    /too large for the WebP format|Processed image is too large/i,
    "The page is taller than the image format can hold.",
  ],
  [/ERR_NAME_NOT_RESOLVED|getaddrinfo/i, "That address doesn't resolve. It may be mistyped."],
  [/ERR_CERT|SSL|certificate/i, "The site's security certificate isn't valid, so the browser refused to load it."],
  [
    /ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ECONNREFUSED/i,
    "The site refused the connection.",
  ],
  [/ERR_CONNECTION_TIMED_OUT|ETIMEDOUT/i, "The site didn't answer in time."],
  [/Timeout .* exceeded|page\.goto: Timeout/i, "The page took more than a minute to load, so the capture gave up."],
  [
    /ERR_TOO_MANY_REDIRECTS/i,
    "The site redirected in a loop, which usually means it wants a sign-in or a cookie Kivli doesn't have.",
  ],
  [/ERR_BLOCKED_BY|ERR_ACCESS_DENIED|403|Forbidden/i, "The site turned the request away, most likely bot protection."],
  [/ERR_ABORTED|Navigation failed because/i, "The page stopped loading before it finished."],
  [/Target (page|closed)|browser has been closed/i, "The browser closed before the page finished rendering."],
];

// `raw` is whatever capture.js printed after FAILED:, one line.
//
// An unrecognised cause keeps the raw message instead of being flattened into
// "the capture failed", which is the sentence this whole file exists to stop
// the app saying. It is not pretty, but it is the difference between a message
// you can search for and one you can only shrug at.
export function explainCaptureFailure(raw) {
  const text = (raw || "").trim();
  if (!text) return "The capture didn't produce a screenshot, and the runner gave no reason.";

  for (const [pattern, sentence] of CAUSES) {
    if (pattern.test(text)) return sentence;
  }

  const firstLine = text.split("\n")[0].slice(0, 180);
  return `The capture failed: ${firstLine}`;
}
