-- M25: components that come from a file, and components that wait their turn.
--
-- Uploads. A component used to be a region cropped from a page Kivli had
-- captured. It can now be an image off your own computer, which has no page
-- to credit, so component.source_url may be empty -- and an empty source_url
-- IS how the app knows a component was uploaded.
--
-- The image waits to be cropped (or kept as it is) in component_capture, the
-- same staging table a captured page waits in. So its url and domain may be
-- empty too, and it remembers the file's name so the list can say which is
-- which.
--
-- The retry queue. A site, a resource and a visual that the AI was too busy to
-- describe wait in a queue and fill in on their own; a component never did, it
-- simply stayed unnamed until someone pressed Regenerate. Same three columns,
-- same ladder, drained by the same scheduled run.
--
-- Safe to run more than once.

alter table component alter column source_url drop not null;

alter table component add column if not exists enrichment_state text;
alter table component add column if not exists enrichment_attempts integer not null default 0;
alter table component add column if not exists enrichment_next_at timestamptz;

create index if not exists component_enrichment_queue_idx
  on component (enrichment_state, enrichment_next_at);

alter table component_capture alter column url drop not null;
alter table component_capture alter column domain drop not null;
alter table component_capture add column if not exists file_name text;
