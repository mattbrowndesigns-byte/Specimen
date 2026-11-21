import { CORS, ownerFromBearer, serve, unauthorized } from "@/lib/mcp/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// A collection with eight thumbnails is eight image fetches and resizes.
export const maxDuration = 60;

// The library as an MCP server, for the owner's own AI. Public in
// middleware.js because the browser session is not how a client signs in: it
// sends a Bearer token from Supabase's OAuth server, checked here.
async function handle(request) {
  const { owner, presented } = await ownerFromBearer(request);
  if (!owner) return unauthorized(request, presented);
  return serve(request, owner);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
