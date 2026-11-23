-- M24: visuals that never lived on a page, and visuals that move.
--
-- Two additions to the Visuals library (schema_m20).
--
-- Uploads. A screenshot on someone's desktop, a deck exported to PNG, a photo
-- of a poster in the street -- there is no page to credit. So a visual's url
-- and domain may now be empty, on the visual and on the project an upload
-- batch is filed under. The unique (user_id, url) index stays as it is:
-- Postgres treats every empty url as distinct, so uploads never collide with
-- each other and a case study still can't be saved twice.
--
-- Video. Case studies loop MP4s -- a logo animating, a site scrolling, a
-- campaign cut -- and a frame of one is a worse record than the loop. A visual
-- gains video_url, the stored MP4; image_url and thumb_url stay what they
-- were, and for a video they are its poster frame, which is what the board
-- lays out by, what the AI describes and what anywhere that can't play a
-- video shows. videos_too_large counts the loops a page had that were over
-- the size cap, so the picker can say they were left out rather than the
-- page simply seeming to have none.
--
-- Safe to run more than once.

alter table visual_project alter column url drop not null;
alter table visual_project alter column domain drop not null;
alter table visual_project add column if not exists videos_too_large integer not null default 0;

alter table visual alter column url drop not null;
alter table visual alter column domain drop not null;
alter table visual add column if not exists video_url text;
