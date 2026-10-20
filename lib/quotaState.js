import { supabaseAdmin } from "@/lib/supabaseAdmin";

// One row, one question: is today's Gemini budget gone?
//
// The free tier is 20 requests a day per model, and the pool belongs to the
// deployment rather than to an account -- so when the last model refuses, it
// has refused everybody until midnight. Writing that down once is what stops
// a queue of ninety sites discovering it ninety times over, three refused
// requests at a time, every fifteen minutes, all night.
//
// Every function here fails open. A marker that cannot be read must never be
// the reason work doesn't happen: the worst case without it is the behaviour
// this app had before, which is a wasted call and a re-queue.
const KEY = "gemini_exhausted_until";

// Google's free-tier day runs on Pacific time. Computed through Intl rather
// than with an offset, because the offset changes twice a year and a hardcoded
// one is wrong for half of it. A DST boundary still shifts this by an hour,
// which the margin below covers.
//
// The margin is not politeness. Asking at 00:00:00 exactly is asking at the
// one instant the counter is most likely to still be rolling over, and the
// cost of being five minutes late is nothing at all.
const RESET_MARGIN_MS = 5 * 60 * 1000;

export function nextQuotaReset(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(now)
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});

  // `hour` comes back as 24 rather than 0 at midnight in some ICU versions.
  const elapsed =
    (Number(parts.hour) % 24) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  return new Date(now.getTime() + (86400 - elapsed) * 1000 + RESET_MARGIN_MS);
}

// Called when every model in the list has refused with a per-day quota error.
export async function markQuotaExhausted() {
  const until = nextQuotaReset();
  try {
    await supabaseAdmin()
      .from("app_state")
      .upsert({ key: KEY, value: { until: until.toISOString() }, updated_at: new Date().toISOString() });
  } catch (err) {
    console.error("Quota marker: failed to write", err.message);
  }
  return until;
}

// Returns the Date the budget comes back, or null if there is budget now.
export async function quotaExhaustedUntil() {
  try {
    const { data } = await supabaseAdmin()
      .from("app_state")
      .select("value")
      .eq("key", KEY)
      .maybeSingle();
    const until = data?.value?.until ? new Date(data.value.until) : null;
    return until && until > new Date() ? until : null;
  } catch (err) {
    console.error("Quota marker: failed to read", err.message);
    return null;
  }
}

// Cleared on any successful call, so a marker written by a bad minute can
// never outlive the thing it was describing.
export async function clearQuotaMark() {
  try {
    await supabaseAdmin().from("app_state").delete().eq("key", KEY);
  } catch {
    // Nothing to do. The marker expires on its own at the reset time.
  }
}
