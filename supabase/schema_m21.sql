-- M21: a visuals project the AI couldn't describe is retried, not forgotten.
--
-- Sites and resources have had a queue since schema_m11/m13; visuals didn't,
-- so a save made while Google's free tier was slow or spent kept no tags and
-- no description until someone noticed and pressed Regenerate -- four projects
-- in two days. Northeastern failed twice in a row on a slow afternoon when a
-- one-word test request took over two minutes.
--
-- Same ladder as the other queues (lib/retrySchedule.js): 2, 4, 8 ... minutes,
-- then hourly, eight attempts, and a spent daily quota waits for midnight
-- Pacific instead of burning its tries. `ai_state` already exists (pending /
-- done / failed) and gains 'queued'.
--
-- Safe to run more than once.

alter table visual_project add column if not exists ai_attempts integer not null default 0;
alter table visual_project add column if not exists ai_next_at timestamptz;

create index if not exists visual_project_ai_queue_idx on visual_project (ai_state, ai_next_at);

-- Anything already saved without a description goes straight into the queue.
update visual_project
set ai_state = 'queued', ai_next_at = now(), ai_attempts = 0
where state = 'saved' and ai_state in ('pending', 'failed');
