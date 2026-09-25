-- M17: two corrections to the block vocabulary, from looking at real results.
--
-- Tab Bottom: the vocabulary had Tab Top and Tab Side and no Tab Bottom, so a
-- tab set whose labels run along the BOTTOM edge of its panel had nowhere to
-- go. 829studios.com's "Our Approach to Perpetual Performance" is one, and it
-- was being missed entirely rather than mistagged.
--
-- Steps: "Step / Process" was being read as Timeline, which is wrong (a
-- timeline is dated) and as Text Rows, which is close but loses the thing worth
-- searching for. What makes a numbered Assess / Plan / Build / Measure block
-- findable is that it is numbered and sequential. The slug does not change, so
-- every existing link survives the rename.

insert into tag (facet, slug, label, is_approved, user_id)
select 'block_pattern', 'tab-bottom', 'Tab Bottom', true, u.user_id
from (select distinct user_id from tag where user_id is not null) u
on conflict do nothing;

update tag set label = 'Steps'
 where facet = 'block_pattern' and slug = 'step-process';
