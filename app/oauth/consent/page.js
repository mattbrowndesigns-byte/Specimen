import { redirect } from "next/navigation";
import Wordmark from "../../_ui/Wordmark";
import { supabaseSession } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect an AI · Kivli" };

// Where Supabase's OAuth server sends someone whose AI app has asked to read
// their library. Supabase owns the protocol -- codes, tokens, refresh -- and
// this page owns the only part that is a decision: who is asking, what they
// will be able to do, and a yes or a no.
//
// A real session only. The demo pass is deliberately not enough: it is a
// stranger looking at someone else's copy, and nothing it holds is theirs to
// hand to an app.
//
// Supabase passes the client name through from the app's own registration,
// so it is shown as a claim ("calls itself"), never as a verified identity.
// The host it will send you back to is the part that can't be faked, so that
// is shown too.

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function Card({ children }) {
  return (
    <main className="auth-page">
      <div className="auth-card consent-card">
        <Wordmark className="auth-wordmark" />
        {children}
      </div>
    </main>
  );
}

export default async function ConsentPage({ searchParams }) {
  const { authorization_id: authorizationId } = await searchParams;
  if (!authorizationId) {
    return (
      <Card>
        <p className="auth-tagline">This link is missing the request it belongs to. Start again from your AI app.</p>
      </Card>
    );
  }

  const supabase = await supabaseSession();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`);
  }

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) {
    return (
      <Card>
        <p className="auth-tagline">
          {error?.message || "That request has expired."} Start again from your AI app; requests last ten minutes.
        </p>
      </Card>
    );
  }
  // Approved before, for the same access: Supabase hands back where to go and
  // there is nothing to ask.
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  const app = data.client?.name || "An AI app";
  const backTo = hostOf(data.redirect_uri);

  return (
    <Card>
      <p className="auth-tagline">
        <strong className="consent-app">{app}</strong> wants to read your library.
      </p>

      <div className="consent-section">
        <h2>It will be able to</h2>
        <ul>
          <li>Search your websites, components, resources and visuals</li>
          <li>Open any save, with its screenshots, colours, type and notes</li>
          <li>Read your collections and your tags</li>
        </ul>
      </div>
      <div className="consent-section">
        <h2>It won&rsquo;t be able to</h2>
        <ul>
          <li>Add, change or delete anything</li>
          <li>See your password or anyone else&rsquo;s library</li>
        </ul>
      </div>

      <form action="/api/oauth/decision" method="POST">
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <button className="auth-submit" type="submit" name="decision" value="approve">
          Allow access
        </button>
        <button className="auth-forgot" type="submit" name="decision" value="deny">
          Cancel
        </button>
      </form>

      <p className="auth-footnote">
        Signed in as {userData.user.email}.{backTo ? ` You'll be sent back to ${backTo}.` : ""} You can disconnect it
        any time from Connect an AI in the menu.
      </p>
    </Card>
  );
}
