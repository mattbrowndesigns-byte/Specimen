-- M30: the words the AI knows, kept apart from the tags you have.
--
-- Every account starts with about 150 words, because an AI left to make up its
-- own calls the same thing Minimal, Minimalist and Clean. They were ordinary
-- tags, so a new library opened with 150 things nobody had put there.
--
-- is_starter marks one the AI may use and nobody has chosen. Until something
-- wears it, no page shows it. The first save that does makes it a tag like any
-- other, and typing it in by hand clears the mark.
--
-- The update runs only when the column is being added: it marks whatever is
-- unused today, and running it again later would mark tags added since.
--
-- Safe to run more than once. Until it is run, unused tags show as they did.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'tag' and column_name = 'is_starter'
  ) then
    alter table tag add column is_starter boolean not null default false;

    update tag t
       set is_starter = true
     where t.is_approved
       and t.facet in ('vertical', 'page_type', 'block_pattern', 'aesthetic', 'resource_type', 'medium')
       and not exists (select 1 from taggable g where g.tag_id = t.id);
  end if;
end $$;
