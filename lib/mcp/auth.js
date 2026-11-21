import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildServer } from "@/lib/mcp/server";

// Who an MCP request is, and the plumbing that answers it.
//
// The AI app signs in through Supabase's own OAuth 2.1 server -- the account
// is the Kivli account, approved on Kivli's consent page -- and then sends the
// access token it was given as a Bearer header on every call. getUser() checks
// it with Supabase rather than trusting the token's own claims, the same rule
// currentUser() follows for a browser session.

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

export function withCors(response) {
  for (const [key, value] of Object.entries(CORS)) response.headers.set(key, value);
  return response;
}

export async function ownerFromBearer(request) {
  const match = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return { owner: null, presented: false };
  const { data, error } = await supabaseAdmin().auth.getUser(match[1].trim());
  if (error || !data?.user) return { owner: null, presented: true };
  return { owner: { id: data.user.id, demo: false }, presented: true };
}

// The 401 is the start of sign-in, not the end of a request: the header names
// the metadata document that tells the client where to send the person to
// approve access (RFC 9728). Without it a client has nowhere to go.
export function unauthorized(request, presented) {
  const origin = new URL(request.url).origin;
  const params = [`realm="kivli"`, `resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"`];
  if (presented) params.push(`error="invalid_token"`);
  return withCors(
    Response.json(
      { error: presented ? "That sign-in has expired or been revoked." : "Sign in to Kivli to use this." },
      { status: 401, headers: { "WWW-Authenticate": `Bearer ${params.join(", ")}` } }
    )
  );
}

// Stateless: a fresh server and transport per request, answering in plain
// JSON. Nothing here needs to remember a conversation -- every tool is one
// read -- and a serverless function cannot keep a session in memory between
// invocations anyway.
export async function serve(request, owner) {
  const origin = new URL(request.url).origin;
  const server = buildServer({ owner, origin });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return withCors(await transport.handleRequest(request));
  } finally {
    // In JSON mode the response is complete when handleRequest returns.
    server.close().catch(() => {});
  }
}
