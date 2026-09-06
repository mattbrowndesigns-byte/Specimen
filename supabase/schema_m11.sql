-- M11: a retry queue for AI enrichment.
--
-- Gemini's free tier is a shared pool: one API key serves everyone on the
-- deployment, so two people saving at once can push it over its per-minute
-- limit. That used to lose the tagging pass for good -- the site landed with
-- captures, no tags, and a review flag that didn't say why.
--
-- Now a rate-limited run is queued rather than dropped. A scheduled workflow
-- drains the queue on a backoff, so the tags fill in on their own once the
-- limit has passed.
--
-- enrichment_state: 'queued' waiting for a retry, 'failed' gave up (a real
-- error, or too many attempts), null/'done' nothing outstanding.

alter table site add column if not exists enrichment_state text;
alter table site add column if not exists enrichment_attempts integer not null default 0;
alter table site add column if not exists enrichment_next_at timestamptz;

-- The drain reads exactly this, every few minutes, forever.
create index if not exists site_enrichment_queue_idx
  on site (enrichment_state, enrichment_next_at)
  where enrichment_state = 'queued';
