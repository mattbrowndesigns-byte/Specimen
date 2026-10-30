import { currentUser } from "@/lib/supabaseServer";
import UtilityBar from "./UtilityBar";
import SiteFooter from "./SiteFooter";
import PublicBar from "./PublicBar";
import SharedFooter from "./SharedFooter";

// The chrome around the three written pages, chosen by whether anyone is
// signed in.
//
// Those pages are linked from a shared library's footer precisely so a
// stranger has somewhere to go, and until now all three bounced them to
// /login -- they render the utility bar, which assumes a session, so making
// them public was never the one-line change to PUBLIC_PATHS it looked like.
// This is the missing half: a server component, so the session is known before
// anything paints and nobody watches the wrong bar swap for the right one.
//
// It sits in a layout rather than in each page so the pages stay what they
// are, which is prose.
export default async function ProseShell({ children }) {
  const signedIn = Boolean(await currentUser());

  return (
    <>
      {signedIn ? <UtilityBar /> : <PublicBar />}
      {children}
      {/* Same rule as the shared page's footer: the site footer is a list of
          places only an account holder can go, so handing it to a stranger is
          four more links that bounce off the login screen. */}
      {signedIn ? <SiteFooter /> : <SharedFooter />}
    </>
  );
}
