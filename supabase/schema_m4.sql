-- M4: components. component_capture is a throwaway staging row for the
-- one-off screenshot a component gets cropped from; component is the
-- saved crop itself (tags/taggable already support it via target_type).

create table if not exists component_capture (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  domain text not null,
  full_url text,
  page_height integer,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists component (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default '00000000-0000-0000-0000-000000000001',
  site_id uuid references site(id) on delete set null,
  source_url text not null,
  name text,
  summary text,
  notes text,
  image_url text,
  source_image_url text,
  crop_rect jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  needs_review boolean not null default false
);

create index if not exists component_site_idx on component (site_id);
