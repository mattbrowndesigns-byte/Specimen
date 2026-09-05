-- M6: accounts.
--
-- Everything until now belonged to one hardcoded user id with row level
-- security switched off. This turns RLS on and scopes every table to the
-- account that owns the row.
--
-- Read this before changing anything here: the app talks to Postgres through
-- API routes using the service-role key, which BYPASSES RLS by design. So the
-- policies below are not what keeps one account out of another's library --
-- the route code does that, by filtering every query on the signed-in user.
-- RLS is the second lock: it means the anon key, which is now exposed to the
-- browser for auth, can't be pointed at the REST API to read the tables
-- directly. Both layers are load-bearing and neither is sufficient alone.

-- 1. Invite codes. Single use: reserved when someone redeems it, and pinned to
-- the account it created so it can never be replayed.
create table if not exists invite_code (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  note text,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid
);

create index if not exists invite_code_unused_idx on invite_code (code) where used_at is null;

-- 2. Ownership. user_id already exists on site and component; the rest of the
-- tables reach their owner through those, except tag, which is per-account
-- vocabulary, and collection, which already carries one.
alter table tag add column if not exists user_id uuid;
alter table page add column if not exists user_id uuid;
-- A capture in flight has no component yet, so it needs its own owner.
alter table component_capture add column if not exists user_id uuid;

-- Backfill the tables that are gaining the column, from the row they hang off.
update page p set user_id = s.user_id from site s where p.site_id = s.id and p.user_id is null;
update tag set user_id = '00000000-0000-0000-0000-000000000001' where user_id is null;
update component_capture set user_id = '00000000-0000-0000-0000-000000000001' where user_id is null;

create index if not exists tag_user_idx on tag (user_id);
create index if not exists page_user_idx on page (user_id);

-- The tag vocabulary is per account now, so the uniqueness that mattered --
-- one "Minimal" per facet -- has to be per account too.
--
-- Constraint first, then index: this index exists to enforce the UNIQUE
-- constraint, so Postgres refuses to drop it on its own. Dropping the
-- constraint takes the index with it, and the second line is only a safety net
-- for a database where the index was created without one.
alter table tag drop constraint if exists tag_facet_slug_key;
drop index if exists tag_facet_slug_key;
create unique index if not exists tag_user_facet_slug_idx on tag (user_id, facet, slug);

-- 3. RLS on, everywhere. No policies for anon or authenticated means no direct
-- access at all through the REST API; the service-role key used by the API
-- routes is unaffected.
alter table site enable row level security;
alter table capture enable row level security;
alter table page enable row level security;
alter table component enable row level security;
alter table component_capture enable row level security;
alter table tag enable row level security;
alter table taggable enable row level security;
alter table collection enable row level security;
alter table collection_item enable row level security;
alter table invite_code enable row level security;

-- 4. search_sites runs as the caller, so it has to stop returning every row.
-- security invoker plus an explicit owner filter, since the function is what
-- the search box goes through.
create or replace function search_sites(search_query text, owner uuid)
returns setof site
language sql
stable
as $$
  select distinct s.*
  from site s
  left join taggable tg on tg.target_type = 'site' and tg.target_id = s.id
  left join tag t on t.id = tg.tag_id
  where s.user_id = owner
    and (
      search_query = ''
      or s.search_vector @@ websearch_to_tsquery('english', search_query)
      or t.label ilike '%' || search_query || '%'
    )
  order by s.saved_at desc;
$$;

-- The old two-argument-less version would still be callable and would still
-- return everything, so it goes.
drop function if exists search_sites(text);
