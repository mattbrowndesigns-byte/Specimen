-- M26: screen recordings, as components and as visuals.
--
-- A component may now be a clip rather than a still: video_url is the stored
-- MP4, and image_url is its poster frame, the same arrangement a visual has
-- had since schema_m24. Everything that shows a component as a picture keeps
-- working without knowing.
--
-- video_frames is a handful of stills spread across the clip, in order, as
-- image addresses. The server has no video decoder, so they are drawn by the
-- browser that uploads the clip -- and kept, because the AI may not be asked
-- until tomorrow, and Regenerate asks again months later.
--
-- Safe to run more than once.

alter table component add column if not exists video_url text;
alter table component add column if not exists video_frames jsonb;
alter table visual add column if not exists video_frames jsonb;
