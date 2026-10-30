import { displayNameFor, possessive } from "@/lib/displayName";
import { SCOPE_NOUN } from "@/lib/shareKinds";

// What a share token may reach, in one file.
//
// The token is the whole of the authorisation for a shared link, so this is
// the only thing standing between a URL and someone's library. It lives here
// because two pages now read through a token -- the list of saves and one
// save's own page -- and two copies of this rule would be two chances for one
// of them to end up looser than the other.
//
// A token that never existed and a token that has been revoked answer
// identically, deliberately: a revoked link must not confirm that it was once
// real.
export async function resolveShare(supabase, token) {
  if (!token) return null;

  const { data: share } = await supabase
    .from("share")
    .select("kind, target_id, user_id, created_at")
    .eq("token", token)
    .maybeSingle();
  if (!share) return null;

  // Off the auth record rather than out of the share row, so renaming
  // yourself renames every link you have already sent.
  const { data: owner } = await supabase.auth.admin.getUserById(share.user_id);
  const ownerName = displayNameFor(owner?.user);

  return {
    share,
    ownerName,
    title: `${possessive(ownerName)} ${SCOPE_NOUN[share.kind] || "library"}`,
  };
}

// Whether a share's scope reaches one particular site.
//
// A library or websites link reaches every site the owner has not hidden; a
// collection link reaches only what was bookmarked into it; a components,
// resources or folder link reaches no sites at all. Hidden is filtered here as
// well as in the list for the obvious reason: a save hidden from the grid must
// not be reachable by typing its id into the address bar.
//
// Every read below destructures `data` alone, which elsewhere in this codebase
// is the bug pattern that turns "your query is wrong" into "you have nothing".
// Here that failure direction is the safe one -- a query that errors yields
// null, which denies -- so it is the right shape in this one place.
export async function shareReachesSite(supabase, share, siteId) {
  if (!siteId) return false;
  if (share.kind === "components" || share.kind === "resources" || share.kind === "folder") {
    return false;
  }

  const { data: site } = await supabase
    .from("site")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", share.user_id)
    .eq("is_hidden", false)
    .maybeSingle();
  if (!site) return false;

  if (share.kind !== "collection") return true;

  // A collection link is scoped twice over: the collection has to be the
  // owner's, and the site has to actually be in it.
  const { data: collection } = await supabase
    .from("collection")
    .select("id")
    .eq("id", share.target_id)
    .eq("user_id", share.user_id)
    .maybeSingle();
  if (!collection) return false;

  const { data: item } = await supabase
    .from("collection_item")
    .select("target_id")
    .eq("collection_id", collection.id)
    .eq("target_type", "site")
    .eq("target_id", siteId)
    .maybeSingle();
  return Boolean(item);
}
