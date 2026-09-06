import { randomBytes } from "crypto";

// 24 bytes of base64url. The token is the whole of the authorisation for a
// shared link, so it's generated here rather than derived from anything about
// the thing it points at -- an id-derived token would let anyone holding one
// link guess the next.
export function newToken() {
  return randomBytes(24).toString("base64url");
}

export const shareUrl = (origin, token) => `${origin}/share/${token}`;
