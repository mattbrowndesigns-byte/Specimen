// Whose library this is.
//
// Stored in auth.users' own metadata rather than in a profile table: it is one
// string, read in exactly two places (the share payload and the account menu),
// and a table would need a user_id, RLS, a policy and a scoped query in every
// route that touched it -- all of that to hold a first name.
//
// The fallback matters more than it looks. Every account that existed before
// this shipped has no display_name, and a shared page reading "'s inspiration
// library" is worse than the generic title it replaced. An email's local part
// is almost always the person's name, so it's a good guess and it's never
// blank.
export function displayNameFor(user) {
  const stored = user?.user_metadata?.display_name;
  if (typeof stored === "string" && stored.trim()) return stored.trim();
  return nameFromEmail(user?.email);
}

export function nameFromEmail(email) {
  const local = (email || "").split("@")[0];
  const words = local
    .split(/[._+-]+/)
    .filter((part) => part && !/^\d+$/.test(part))
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
  return words.join(" ") || "Someone";
}

// "Matt's", "Chris's". Modern usage takes the extra s on a name ending in one,
// and guessing at the older style gets it wrong on Jones as often as right.
export const possessive = (name) => `${name}’s`;
