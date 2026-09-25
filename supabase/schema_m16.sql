-- M16: a retry queue for the typeface naming pass.
--
-- Why: tagging already had one (schema_m11) and naming never did, so the two
-- halves of a save behaved differently against the same rate limit. A 429 on
-- the tags fills itself in within the hour; a 429 on the typefaces waited for
-- someone to press "Re-read Colours & Type" by hand, and mostly nobody did --
-- four of the twelve most recent sites were carrying measured, unnamed faces.
--
-- Same three columns and the same meanings as the enrichment queue:
--   fonts_state: 'queued' waiting for a retry, 'failed' gave up, null otherwise
--   fonts_attempts: how many times naming has been tried
--   fonts_next_at: earliest time to try again
alter table site add column if not exists fonts_state text;
alter table site add column if not exists fonts_attempts integer not null default 0;
alter table site add column if not exists fonts_next_at timestamptz;

-- Partial, like the enrichment one: the queue is nearly always empty, and this
-- index only has to make "what is due" cheap.
create index if not exists site_fonts_queue_idx
  on site (fonts_state, fonts_next_at)
  where fonts_state = 'queued';
