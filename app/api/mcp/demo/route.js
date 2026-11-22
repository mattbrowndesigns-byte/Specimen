import { demoUser } from "@/lib/demo";
import { CORS, serve, withCors } from "@/lib/mcp/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// The demo library over MCP, with no sign-in: the same seeded copy /demo
// shows, so a stranger can point their own AI at it and ask it things. It can
// only ever read: the write tools are registered for a signed-in owner and
// not for `demo: true`, so there is nothing here for the door to refuse. Keep
// it that way -- pass anything but `demo: true` and strangers can add to the
// demo library.
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
