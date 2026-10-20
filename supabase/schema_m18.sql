-- M18: a capture queue, and one shared note saying the day's Gemini budget is
-- gone.
--
-- Both exist for the same reason: importing a hundred bookmarks at once is a
-- different shape of work to saving one site, and the parts of this app that
-- were built for one site at a time quietly fall over at a hundred.
--
-- 1. THE CAPTURE QUEUE. Saving a site dispatches a GitHub Actions run on the
--    spot. A hundred of those at once is a hundred workflow runs and a hundred
--    page fetches inside one HTTP request, which no request survives. Captures
--    cost no Gemini quota -- only free runner minutes -- so this queue is not
--    about rationing. It is about arriving in batches rather than all at once,
--    and about doing the per-site page fetch at the moment the site is
--    captured instead of at the moment it is pasted.
--
-- 2. THE QUOTA MARKER. The free tier is 20 requests a day per model, so the
--    thing a queued enrichment is waiting for is MIDNIGHT, not a busy minute.
--    Every backoff ladder here tops out at an hour and gives up after eight
--    tries, which is about four hours -- so a site queued at 9pm against an
--    exhausted day was marked 'failed' by 1am and never looked at again. For
--    one save a day that never mattered. For an import spanning three days it
--    would have lost most of the library's tags.
--
--    app_state is deployment state, not user data: the Gemini pool is shared
--    by every account here, so "today's budget is gone" is true for all of
--    them at once. That is why it has no user_id and no policies -- RLS is on
--    with nothing granted, so the service role is the only thing that can read
--    it, which is every route in this app and nothing in a browser.

alter table site add column if not exists capture_state text;
alter table site add column if not exists capture_attempts integer not null default 0;
alter table site add column if not exists capture_next_at timestamptz;

-- Partial, like the other two queues: it is nearly always empty and only has
-- to make "what is due" cheap.
create index if not exists site_capture_queue_idx
  on site (capture_state, capture_next_at)
  where capture_state = 'queued';

-- When a row arrived as part of a bulk import, so the import page can report
-- on a batch after the fact. Null for everything saved one at a time, which is
-- also how the dashboard tells them apart.
alter table site add column if not exists imported_at timestamptz;
alter table resource add column if not exists imported_at timestamptz;

create index if not exists site_imported_idx on site (user_id, imported_at)
  where imported_at is not null;
create index if not exists resource_imported_idx on resource (user_id, imported_at)
  where imported_at is not null;

create table if not exists app_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- On, with nothing granted. See the note above: this is the second lock, and
-- here it is the only one that could apply, because there is no user to scope
-- a query to.
alter table app_state enable row level security;
