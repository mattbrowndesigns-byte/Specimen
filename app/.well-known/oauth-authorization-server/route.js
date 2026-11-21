import { CORS } from "@/lib/mcp/auth";

export const dynamic = "force-dynamic";

// For clients written against the older MCP auth spec, which looked for the
// authorization server at the MCP server's own origin instead of reading the
// protected-resource document. Supabase's discovery document, passed through
// unchanged, so the endpoints it names are still Supabase's.
export async function GET() {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/.well-known/oauth-authorization-server/auth/v1`,
    { next: { revalidate: 3600 } }
  );
  if (!res.ok) return Response.json({ error: "Sign-in isn't available right now." }, { status: 502, headers: CORS });
  return Response.json(await res.json(), { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
