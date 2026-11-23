-- M27: the queues run on Supabase's clock instead of GitHub's.
--
-- enrich-queue.yml asks GitHub for a run every fifteen minutes. GitHub starts
-- scheduled workflows when it has room, and in November 2026 that was three to
-- five times a day, 4.5 hours apart at the median and 10.5 at worst. Nothing
-- failed, so nothing said so; imports and queued tags just arrived late.
--
-- pg_cron runs inside this database and pg_net makes the request. Both are on
-- the free plan. The workflow stays as a backup, a few times a day.
--
-- Needs app_state (schema_m18).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- A key of its own rather than CALLBACK_SECRET, made here so nobody has to
-- copy one. All it can do is start a queue (lib/queueAuth.js). app_state has
-- RLS on with no policies, so only the service role and this database's owner
-- can read it.
insert into app_state (key, value)
values ('queue_token', jsonb_build_object('token', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')))
on conflict (key) do nothing;

-- Four jobs a few minutes apart: two of them spend the same AI allowance, and
-- asking at once is how a busy minute gets refused. Scheduling a name that
-- already exists replaces it, so this file can be run again.
--
-- Written inline rather than as a function, because a function in public is
-- one anyone with the anon key could call.
select cron.schedule('kivli-enrich-queue', '0,15,30,45 * * * *', $$
  select net.http_post(
    url := 'https://specimen-gamma-six.vercel.app/api/enrich-queue',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-queue-token', (select value->>'token' from public.app_state where key = 'queue_token')),
    timeout_milliseconds := 60000
  )
$$);

select cron.schedule('kivli-capture-queue', '4,19,34,49 * * * *', $$
  select net.http_post(
    url := 'https://specimen-gamma-six.vercel.app/api/capture-queue',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-queue-token', (select value->>'token' from public.app_state where key = 'queue_token')),
    timeout_milliseconds := 60000
  )
$$);

select cron.schedule('kivli-visuals-queue', '8,23,38,53 * * * *', $$
  select net.http_post(
    url := 'https://specimen-gamma-six.vercel.app/api/visuals-queue',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-queue-token', (select value->>'token' from public.app_state where key = 'queue_token')),
    timeout_milliseconds := 60000
  )
$$);

select cron.schedule('kivli-visuals-import-queue', '12,27,42,57 * * * *', $$
  select net.http_post(
    url := 'https://specimen-gamma-six.vercel.app/api/visuals-import-queue',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-queue-token', (select value->>'token' from public.app_state where key = 'queue_token')),
    timeout_milliseconds := 60000
  )
$$);

-- pg_cron keeps a row per run for ever; a week of them is plenty.
select cron.schedule('kivli-cron-cleanup', '10 9 * * *', $$
  delete from cron.job_run_details where end_time < now() - interval '7 days'
$$);
