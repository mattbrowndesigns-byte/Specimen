"use client";
import { createBrowserClient } from "@supabase/ssr";

// Browser-side auth only -- signing in, signing out, reading who's signed in.
// Every piece of library data still comes from this app's own API routes.
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
