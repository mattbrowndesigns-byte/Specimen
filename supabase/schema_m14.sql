-- M14: share what you choose, not all or nothing.
--
-- A share used to be the whole library or one collection. Now that the library
-- has three tabs, "share it" is an over-answer: someone sending a friend their
-- component crops has no reason to hand over 150 saved websites as well. So
-- `kind` gains the three tabs, plus `folder` -- one resource_type tag, which is
-- what the folder strip on the Resources tab actually filters by.
--
-- Each kind is its own row and so its own token. That means four links can
-- exist at once and be revoked independently, which is the point: revoking the
-- components link shouldn't take the library link down with it.

alter table share drop constraint if exists share_kind_check;
alter table share add constraint share_kind_check
  check (kind in ('library', 'sites', 'components', 'resources', 'collection', 'folder'));

-- The tab-level kinds carry no target; a collection and a folder both name one
-- row. Replaces the old `(kind = 'library') = (target_id is null)`.
alter table share drop constraint if exists share_target_ck;
alter table share add constraint share_target_ck
  check ((kind in ('collection', 'folder')) = (target_id is not null));

-- `share_one_per_target_idx` on (user_id, kind, coalesce(target_id, ...)) needs
-- no change: it already keys on the pair, so a second kind with a null target
-- is a different row and a second folder is a different row.

-- A display name, so a shared page can say whose library it is. It lives in
-- auth.users' own metadata rather than in a profile table: it is one string,
-- it is read at exactly two points (the share payload and the account menu),
-- and a table for it would need a user_id, RLS, a policy and a scoped query in
-- every route that touched it.
--
-- Nothing to migrate here -- `raw_user_meta_data` already exists on
-- auth.users, and an account without the key falls back to the capitalised
-- local part of its email. This block is a no-op that documents where the
-- value lives, because that is genuinely hard to find later.
do $$
begin
  raise notice 'display_name lives in auth.users.raw_user_meta_data->>''display_name''';
end $$;
