-- M10: how prominent a discovered page is, rather than which template it is.
--
-- page_type asked "what kind of page is this", which produced an FAQ index and
-- one FAQ entry sitting side by side as equals, and five product pages that
-- are one template shown five times. Tier asks how central the page is to the
-- site instead -- primary / secondary / tertiary -- which is the question you
-- have when you're deciding what to look at first.
--
-- page_type is left in place: it still drives nothing, but a column with data
-- in it is cheaper to keep than to drop and regret.

alter table page add column if not exists tier text;
