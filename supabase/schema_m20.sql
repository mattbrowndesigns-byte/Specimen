-- M20: Visuals -- the images off an agency case study, one record per image.
--
-- A website capture of a case study records the agency's page template; what
-- the owner wants is the work on it. So a save pulls the images off the page,
-- a model pre-selects which ones are the work, the owner confirms, and every
-- image kept becomes its own record with its own tags and its own page.
--
-- Two tables, because there are two things:
--
--   visual_project  one URL. Holds the candidates while you pick, then the
--                   project's own title and summary afterwards.
--   visual          one kept image. The unit of the library: the card, the
--                   detail page, the thing search lands on.
--
-- Safe to run more than once.

create table if not exists visual_project (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  domain text not null,
  -- The case study's own name ("Oatly rebrand") and the agency that made it.
  title text,
  agency_name text,
  summary text,
  favicon_url text,
  favicon_fills boolean not null default true,
  -- extracting -> picking -> saved, or failed. A project that is picking is
  -- one you have not finished choosing from yet.
  state text not null default 'extracting',
  -- Did the model's pre-selection run? 'pending', 'done' or 'failed' --
  -- failed means the piles came from the size heuristic instead.
  ai_state text not null default 'pending',
  error text,
  -- Every image found, while you pick. jsonb rather than a table for the
  -- same reason palette and fonts are: always read with the project, never
  -- queried across rows, and it inherits the project's RLS for free.
  candidates jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists visual_project_user_idx on visual_project (user_id, created_at desc);

-- The same case study twice is a slip, like a resource twice.
create unique index if not exists visual_project_user_url_idx on visual_project (user_id, url);

alter table visual_project enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'visual_project' and policyname = 'visual_project_owner') then
    create policy visual_project_owner on visual_project
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create table if not exists visual (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references visual_project(id) on delete cascade,
  -- Attribution, copied down from the project so a visual always carries it
  -- even on its own: the page it came from and who made it.
  url text not null,
  domain text not null,
  agency_name text,
  title text,
  summary text,
  notes text,
  image_url text not null,
  thumb_url text not null,
  -- The original file on the agency's site, for the record.
  source_image_url text,
  width integer,
  height integer,
  -- Order on the original page, so "more from this project" reads in the
  -- order the agency told the story.
  position integer not null default 0,
  needs_review boolean not null default true,
  is_favorite boolean not null default false,
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists visual_user_saved_idx on visual (user_id, saved_at desc);
create index if not exists visual_project_idx on visual (project_id, position);

alter table visual enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'visual' and policyname = 'visual_owner') then
    create policy visual_owner on visual
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- `medium` is the sixth facet: what kind of artifact this is. Visuals also use
-- vertical and aesthetic; block_pattern and page_type are web vocabulary.
alter table tag drop constraint if exists tag_facet_check;
alter table tag add constraint tag_facet_check
  check (facet in ('vertical', 'page_type', 'block_pattern', 'aesthetic', 'resource_type', 'medium'));

alter table taggable drop constraint if exists taggable_target_type_check;
alter table taggable add constraint taggable_target_type_check
  check (target_type in ('site', 'page', 'component', 'resource', 'visual'));

-- The starting medium vocabulary for accounts that already exist. New
-- accounts get it from lib/starterTags.js.
insert into tag (user_id, facet, slug, label, is_approved)
select u.id, 'medium', v.slug, v.label, true
from auth.users u
cross join (values
  ('logo', 'Logo'),
  ('identity-system', 'Identity System'),
  ('typography', 'Typography'),
  ('packaging', 'Packaging'),
  ('poster', 'Poster'),
  ('print', 'Print'),
  ('editorial', 'Editorial'),
  ('stationery', 'Stationery'),
  ('signage', 'Signage'),
  ('environmental', 'Environmental'),
  ('out-of-home', 'Out of Home'),
  ('merchandise', 'Merchandise'),
  ('photography', 'Photography'),
  ('illustration', 'Illustration'),
  ('3d', '3D'),
  ('pattern', 'Pattern'),
  ('iconography', 'Iconography'),
  ('digital', 'Digital'),
  ('social', 'Social')
) as v(slug, label)
on conflict (user_id, facet, slug) do nothing;
