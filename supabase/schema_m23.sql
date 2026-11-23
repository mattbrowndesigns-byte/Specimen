-- M23: components and visuals can be imported, like websites and resources.
--
-- Importing a website stores a URL and queues the capture; the per-link work
-- happens later, in the queues. The two other kinds that start from a URL
-- needed the same columns to do the same thing.
--
--   component_capture  a queued capture (dispatched by /api/capture-queue
--                      beside the sites') and, once it is in, a row waiting
--                      on the Components tab for you to crop. `cropped_at`
--                      is what takes it off that list.
--
--   visual_project     a queued read of the page (/api/visuals-import-queue)
--                      before the project waits on the Visuals tab to be
--                      picked from. `state` gains 'queued'; the AI sort that
--                      follows reuses ai_state / ai_attempts / ai_next_at
--                      from schema_m21.
--
-- `imported_at` is one timestamp per import, the same as on site and
-- resource, so the import page can report on "the import" rather than on a
-- hundred unrelated rows.
--
-- Safe to run more than once.

alter table component_capture add column if not exists imported_at timestamptz;
alter table component_capture add column if not exists capture_state text;
alter table component_capture add column if not exists capture_attempts integer not null default 0;
alter table component_capture add column if not exists capture_next_at timestamptz;
alter table component_capture add column if not exists cropped_at timestamptz;

create index if not exists component_capture_queue_idx
  on component_capture (capture_state, capture_next_at);
create index if not exists component_capture_imported_idx
  on component_capture (user_id, imported_at);

alter table visual_project add column if not exists imported_at timestamptz;
alter table visual_project add column if not exists extract_attempts integer not null default 0;
alter table visual_project add column if not exists extract_next_at timestamptz;

create index if not exists visual_project_extract_queue_idx
  on visual_project (state, extract_next_at);
