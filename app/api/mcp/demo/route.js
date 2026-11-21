import { demoUser } from "@/lib/demo";
import { CORS, serve, withCors } from "@/lib/mcp/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// The demo library over MCP, with no sign-in: the same seeded copy /demo
// shows, so a stranger can point their own AI at it and ask it things. It can
// only ever read, because no tool on this server writes -- there is nothing
// for the demo's rule at the door to refuse.
async function handle(request) {
  const demo = demoUser();
  if (!demo.id) return withCors(Response.json({ error: "The demo isn't set up here." }, { status: 404 }));
  return serve(request, { id: demo.id, demo: true });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
