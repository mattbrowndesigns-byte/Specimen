-- Visuals can go in collections.
--
-- A visual already carried the heart (`visual.is_favorite`, schema_m20) but
-- had no bookmark, because `collection_item.target_type` only allowed the
-- three earlier kinds. The lightbox now offers both, so the check takes a
-- fourth value. `target_id` stays without a foreign key, like the others:
-- deleting a visual has to remove its collection rows explicitly (the visual
-- DELETE route does).
--
-- Safe to run more than once.

alter table collection_item drop constraint if exists collection_item_target_type_check;
alter table collection_item add constraint collection_item_target_type_check
  check (target_type in ('site', 'component', 'resource', 'visual'));
