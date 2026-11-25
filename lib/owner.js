// Whose deployment this is. There's no roles table for one person and a handful
// of friends: the owner is whoever's email matches OWNER_EMAIL. Invites and the
// design system page are theirs alone.
export function isOwner(user) {
  const owner = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  return Boolean(owner) && user?.email?.toLowerCase() === owner;
}
