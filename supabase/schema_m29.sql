-- M29: tag groups of your own, and merged words that stay merged.
--
-- A group is what the code calls a facet: the question a tag answers. There
-- were six and they were a check constraint, so a seventh meant a migration.
--
-- tag_group holds two kinds of row. A group somebody made, whose key starts
-- with "g_" and is what its tags carry in tag.facet. And the changes an
-- account has made to a built-in one (a new name, fewer libraries, hidden) --
-- no row means unchanged, so an account that has never touched this has none.
--
-- tag_alias is a word that was merged away. The AI used to be free to propose
-- it again the next day, which is how a merge came undone.
--
-- Safe to run more than once. Until it is run the app behaves as it did: the
-- six built-in groups, and no way to make another.

create table if not exists tag_group (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  key text not null,
  -- Null on a built-in means its own name.
  label text,
  -- What the group asks about a save. The AI reads it.
  question text,
  -- Which libraries use it: site, component, visual, resource. Null on a
  -- built-in means all the ones it can be used on.
  kinds text[],
  filled_by text not null default 'ai' check (filled_by in ('ai', 'me')),
  -- Hidden rather than deleted: the tags and everything wearing them stay.
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Tagging what was saved before the group existed, a batch at a time.
  -- fill_cursor is {kind, after}: the library it is in and the last id done.
  fill_state text check (fill_state in ('queued', 'done', 'failed')),
  fill_cursor jsonb,
  fill_total integer not null default 0,
  fill_done integer not null default 0,
  fill_attempts integer not null default 0,
  fill_next_at timestamptz
);

create unique index if not exists tag_group_user_key_idx on tag_group (user_id, key);
create index if not exists tag_group_fill_idx on tag_group (fill_next_at) where fill_state = 'queued';

create table if not exists tag_alias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  facet text not null,
  slug text not null,
  -- The tag that word means now. A tag that goes takes its old names with it.
  tag_id uuid not null references tag (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists tag_alias_user_facet_slug_idx on tag_alias (user_id, facet, slug);
create index if not exists tag_alias_tag_idx on tag_alias (tag_id);

-- On, with nothing granted: every read is an API route with the service role.
alter table tag_group enable row level security;
alter table tag_alias enable row level security;

-- The six built-ins, or a key in the shape the app makes.
alter table tag drop constraint if exists tag_facet_check;
alter table tag add constraint tag_facet_check
  check (
    facet in ('vertical', 'page_type', 'block_pattern', 'aesthetic', 'resource_type', 'medium')
    or facet ~ '^g_[a-z0-9]{8}$'
  );
