import { nextQuotaReset } from "@/lib/quotaState";

// One ladder, used by all three queues: a site's tags, a site's typefaces and
// a resource's description. They were three copies of the same numbers with a
// comment on each saying the others must match, which is how copies drift.
//
// 2, 4, 8, 16, 32, 64 minutes, then hourly. Long enough that a queue backing
// up doesn't itself become the thing hammering the rate limit.
export const MAX_ATTEMPTS = 8;
const backoffMs = (attempts) => Math.min(2 ** attempts, 60) * 60 * 1000;

// What to write on a row whose model call just failed.
//
// The ladder above answers a busy minute, which is what it was built for and
// what it is good at. It is the wrong answer to a spent day: eight tries at
// those intervals is about four hours, so a site queued in the evening against
// an exhausted daily quota was marked 'failed' before midnight and never
// looked at again. The quota it was waiting for had not even reset yet.
//
// So when lib/ai.js reports that every model is out of requests for the day,
// the wait becomes the reset rather than an hour -- the attempt still counts,
// because eight of these is eight days and a thing that has not worked in
// eight days is not going to. What changes is that the eight tries are now
// spread across the thing being waited for instead of being spent inside the
// first evening of it.
export function scheduleRetry(err, currentAttempts) {
  const attempts = (currentAttempts || 0) + 1;
  const canRetry = err?.retryable !== false && attempts <= MAX_ATTEMPTS;
  if (!canRetry) return { state: "failed", attempts, nextAt: null };

  const wait = err?.quotaExhausted
    ? nextQuotaReset().toISOString()
    : new Date(Date.now() + backoffMs(attempts)).toISOString();
  return { state: "queued", attempts, nextAt: wait };
}

// What to write when we knew before calling that there was nothing to spend.
//
// Deliberately NOT an attempt: nothing was attempted. A row that is waiting
// its turn behind a hundred others must not spend its eight tries learning,
// once every fifteen minutes, what one shared marker already knows. The queues
// drain oldest-first, so a row deferred this way keeps its place rather than
// going to the back.
export function deferForQuota(currentAttempts) {
  return {
    state: "queued",
    attempts: currentAttempts || 0,
    nextAt: nextQuotaReset().toISOString(),
  };
}
