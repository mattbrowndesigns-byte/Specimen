-- M12: share links for a collection or for a whole library.
--
-- One table for both, because the difference is only what the link resolves
-- to: kind 'collection' carries a target_id, kind 'library' doesn't. A row
-- existing IS the share, so revoking is a delete and there's no such thing as
-- a stale token that still half-works.
--
-- The token is what authorises a reader, so it's generated server-side, long
-- enough not to be guessed, and never derived from the id it points at.
--
-- RLS is on for the same reason it's on everywhere here: the anon key reaches
-- the REST API from the browser, and the route code's own scoping is the first
-- lock rather than the only one. The public read path deliberately uses the
-- service role and looks a row up BY TOKEN, so it never needs a session.

create table if not exists share (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('library', 'collection')),
  target_id uuid,
  token text not null unique,
  label text,
  created_at timestamptz not null default now(),
  -- A collection is shared once, and a library is shared once. Asking again
  -- returns the existing link rather than minting a second one that also works.
  constraint share_target_ck check ((kind = 'library') = (target_id is null))
);

create unique index if not exists share_one_per_target_idx
  on share (user_id, kind, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists share_token_idx on share (token);

alter table share enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'share' and policyname = 'share_owner') then
    create policy share_owner on share
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
