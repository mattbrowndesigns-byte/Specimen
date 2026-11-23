import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Who may start a queue: GitHub Actions with CALLBACK_SECRET, or Supabase's
// own scheduler with the key schema_m27 made for it. That key lives in the
// database and can do nothing else, so the runner's secret never has to.
//
// Fails closed, unlike the quota marker: a key that can't be read is no key.

const TOKEN_KEY = "queue_token";

function same(a, b) {
  if (!a || !b) return false;
  const hash = (value) => crypto.createHash("sha256").update(value).digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
}

export async function isQueueCaller(request, queue) {
  if (same(request.headers.get("x-callback-secret"), process.env.CALLBACK_SECRET)) return true;

  const token = request.headers.get("x-queue-token");
  if (!token) return false;
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from("app_state").select("value").eq("key", TOKEN_KEY).maybeSingle();
  if (error || !same(token, data?.value?.token)) return false;

  // When the schedule last got through, because the one it replaced was hours
  // late for weeks and nothing anywhere recorded it.
  const now = new Date().toISOString();
  await supabase
    .from("app_state")
    .upsert({ key: `queue_ran:${queue}`, value: { at: now }, updated_at: now })
    .then(({ error: failed }) => failed && console.error("Queue: couldn't record the run", failed.message));
  return true;
}
