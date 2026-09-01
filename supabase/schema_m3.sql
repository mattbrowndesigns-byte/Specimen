-- M3: full-text search across name/summary/notes/domain, plus a search
-- function that also matches on tag labels (tags live in a separate
-- table, so they can't be part of a single generated column).

alter table site add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('english',
      coalesce(name, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(notes, '') || ' ' ||
      coalesce(domain, '')
    )
  ) stored;

create index if not exists site_search_idx on site using gin (search_vector);

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
