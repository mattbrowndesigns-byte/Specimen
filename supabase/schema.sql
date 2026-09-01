-- M1 schema: just enough to save a URL and store its two screenshots.
-- Tables for pages, components, and tags arrive in later milestones.
create extension if not exists "pgcrypto";

create table if not exists site (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default '00000000-0000-0000-0000-000000000001',
  url text not null,
  domain text not null,
  name text,
  summary text,
  notes text,
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  needs_review boolean not null default false
);

create table if not exists capture (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references site(id) on delete cascade,
  viewport text not null check (viewport in ('desktop', 'mobile')),
  full_url text,
  thumb_url text,
  captured_at timestamptz not null default now(),
  page_height integer,
  unique (site_id, viewport)
);

create index if not exists site_saved_at_idx on site (saved_at desc);

-- Row Level Security is intentionally left off until M6, when real auth
-- arrives. Turning it on now would block all reads/writes from this app,
-- since there are no policies and no logged-in user yet.
