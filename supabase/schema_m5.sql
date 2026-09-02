-- M5: page discovery. Nav/footer links extracted from the one HTML fetch
-- already done at save time -- no extra screenshots, classified by the
-- same AI call that tags the site.

create table if not exists page (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references site(id) on delete cascade,
  url text not null,
  label text,
  page_type text,
  created_at timestamptz not null default now()
);

create index if not exists page_site_idx on page (site_id);

-- Replaces the M3 version to also match on discovered page labels.
create or replace function search_sites(search_query text)
returns setof site
language sql
stable
as $$
  select distinct s.*
  from site s
  left join taggable tg on tg.target_type = 'site' and tg.target_id = s.id
  left join tag t on t.id = tg.tag_id
  left join page p on p.site_id = s.id
  where search_query = ''
     or s.search_vector @@ websearch_to_tsquery('english', search_query)
     or t.label ilike '%' || search_query || '%'
     or p.label ilike '%' || search_query || '%'
  order by s.saved_at desc;
$$;
