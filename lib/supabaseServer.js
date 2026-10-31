import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { DEMO_PASS_COOKIE, demoUser, isValidDemoPass } from "./demo";

// The session client. Uses the anon key and the request's cookies, so it only
// ever sees what the signed-in user is allowed to see -- it exists to answer
// "who is this?", not to read data.
//
// Data still goes through supabaseAdmin() and the service-role key, as it
// always has. That key bypasses RLS, which is why every route has to filter on
// the user id itself; see supabase/schema_m6.sql for why both layers exist.
export async function supabaseSession() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) store.set(name, value, options);
          } catch {
            // Route handlers can be rendered where cookies are read-only; the
            // middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    }
  );
}

// getUser(), not getSession(): getSession trusts whatever is in the cookie,
// getUser verifies the token with Supabase.
//
// A real session wins over a demo pass, so the owner opening /demo in their
// own browser still sees their own library. Without one, a valid pass answers
// as the demo account -- read-only, because middleware.js refuses every write
// before a route is reached.
export async function currentUser() {
  const supabase = await supabaseSession();
  const { data, error } = await supabase.auth.getUser();
  if (!error && data?.user) return data.user;
  const store = await cookies();
  if (await isValidDemoPass(store.get(DEMO_PASS_COOKIE)?.value)) return demoUser();
  return null;
}
