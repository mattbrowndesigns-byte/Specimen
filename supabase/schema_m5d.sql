-- Favorites and collections.
--
-- Two different shapes on purpose. A favorite is one flag on the record --
-- there's exactly one starred list and nothing to order or name, so it doesn't
-- need a table. A collection is the many-to-many case: one site can sit in
-- several curated lists, so it needs a join.
--
-- collection_item is polymorphic in the same way `taggable` is, so target_id
-- carries no foreign key and deleting a site or component does NOT cascade to
-- its collection rows. The site and component DELETE routes clear them by
-- hand, exactly as they already do for tag links.

alter table site add column if not exists is_favorite boolean not null default false;
alter table component add column if not exists is_favorite boolean not null default false;

-- Partial indexes: the only query is "the favorites", never "the rest".
create index if not exists site_is_favorite_idx on site (is_favorite) where is_favorite;
create index if not exists component_is_favorite_idx on component (is_favorite) where is_favorite;

create table if not exists collection (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default '00000000-0000-0000-0000-000000000001',
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists collection_name_idx on collection (user_id, lower(name));

create table if not exists collection_item (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collection(id) on delete cascade,
  target_type text not null check (target_type in ('site', 'component')),
  target_id uuid not null,
  added_at timestamptz not null default now(),
  unique (collection_id, target_type, target_id)
);

-- Answers "which collections is this record in?", which is what the bookmark
-- modal asks on every open.
create index if not exists collection_item_target_idx on collection_item (target_type, target_id);

-- search_sites returns `setof site` and the table just grew a column, so the
-- stored definition is rebuilt against the new row type.
create or replace function search_sites(search_query text)
returns setof site
language sql
stable
as $$
  select distinct s.*
  from site s
  left join taggable tg on tg.target_type = 'site' and tg.target_id = s.id
  left join tag t on t.id = tg.tag_id
  where search_query = ''
     or s.search_vector @@ websearch_to_tsquery('english', search_query)
     or t.label ilike '%' || search_query || '%'
  order by s.saved_at desc;
$$;
