-- M13: resources — links saved for what they DO, not for how they look.
--
-- An icon library, a free image source, an AI tool. The rest of this app is
-- built on the premise that a record has a screenshot worth looking at; these
-- records don't, and forcing them into `site` would mean a table where half
-- the rows have no capture, no palette, no fonts and no reason to own a detail
-- page. So it's a separate table with a much smaller shape.
--
-- Deliberately absent: capture, page, palette, fonts, style_history, is_hidden.
-- A resource is a URL with a title, a sentence and some tags.

create table if not exists resource (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  domain text not null,
  title text not null,
  summary text,
  notes text,
  favicon_url text,
  favicon_fills boolean not null default true,
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  needs_review boolean not null default false,
  is_favorite boolean not null default false,
  enriched_at timestamptz,
  -- Same queue vocabulary as `site`, drained by the same workflow: the free
  -- Gemini tier is one shared pool, so "busy" is a normal Tuesday here too.
  enrichment_state text,
  enrichment_attempts integer not null default 0,
  enrichment_next_at timestamptz
);

create index if not exists resource_user_saved_idx on resource (user_id, saved_at desc);
create index if not exists resource_queue_idx on resource (enrichment_state, enrichment_next_at);

-- Saving the same link twice is a slip, not an intention. Sites don't dedupe
-- because a redesign is a reason to re-capture the same URL; a bookmark has no
-- such reason, and Raindrop catching this is a thing the owner will miss.
create unique index if not exists resource_user_url_idx on resource (user_id, url);

alter table resource enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'resource' and policyname = 'resource_owner') then
    create policy resource_owner on resource
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- `resource_type` is a fifth facet and the ONLY one a resource uses. The other
-- four describe a page's design -- "Mega Footer" and "Brutalist" say nothing
-- about an icon set -- so sharing them would put words in the dashboard's tag
-- strip that can never match a website. Keeping resources on their own facet
-- is what stops the visual library being diluted by the tool library.
alter table tag drop constraint if exists tag_facet_check;
alter table tag add constraint tag_facet_check
  check (facet in ('vertical', 'page_type', 'block_pattern', 'aesthetic', 'resource_type'));

-- Both polymorphic tables already carry a target_type; each just needs to
-- admit one more value. This is the whole of what "resources get tags" and
-- "resources go in collections" costs at the database level.
alter table taggable drop constraint if exists taggable_target_type_check;
alter table taggable add constraint taggable_target_type_check
  check (target_type in ('site', 'page', 'component', 'resource'));

alter table collection_item drop constraint if exists collection_item_target_type_check;
alter table collection_item add constraint collection_item_target_type_check
  check (target_type in ('site', 'component', 'resource'));

-- The starting resource_type vocabulary, for accounts that already exist.
-- New accounts get it from lib/starterTags.js at the moment they're created;
-- this backfills everyone who signed up before this migration.
insert into tag (user_id, facet, slug, label, is_approved)
select u.id, 'resource_type', v.slug, v.label, true
from auth.users u
cross join (values
  ('icons', 'Icons'),
  ('illustration', 'Illustration'),
  ('photography', 'Photography'),
  ('type', 'Type'),
  ('colour', 'Colour'),
  ('mockups', 'Mockups'),
  ('motion', 'Motion'),
  ('ai', 'AI'),
  ('dev-tools', 'Dev Tools'),
  ('prototyping', 'Prototyping'),
  ('accessibility', 'Accessibility'),
  ('templates', 'Templates'),
  ('reading', 'Reading')
) as v(slug, label)
on conflict (user_id, facet, slug) do nothing;
