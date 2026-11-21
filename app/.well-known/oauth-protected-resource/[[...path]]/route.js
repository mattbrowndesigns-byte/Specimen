import { CORS } from "@/lib/mcp/auth";

export const dynamic = "force-dynamic";

// RFC 9728: what an AI app reads after its first 401 to learn who signs
// people in for this server. The answer is Supabase's own OAuth 2.1 server,
// so there is no token code here at all -- Supabase issues and refreshes them,
// and Kivli's part is the consent page it sends people to.
//
// Served at the bare path and at /api/mcp under it, because clients try the
// path-specific location first and the bare one second.
export function GET(request) {
  const origin = new URL(request.url).origin;
  return Response.json(
    {
      resource: `${origin}/api/mcp`,
      authorization_servers: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
      bearer_methods_supported: ["header"],
      resource_name: "Kivli",
      resource_documentation: `${origin}/connect`,
    },
    { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } }
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
