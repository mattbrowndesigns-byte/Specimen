// A typed link, made absolute: null when cleared, undefined when it isn't one.
export function creatorLink(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}
