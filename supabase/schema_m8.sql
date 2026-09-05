-- M8: keep the previous style readings.
--
-- A library of design work is exactly the place to notice that a site has been
-- redesigned, and that's only possible if the last reading survives the next
-- one. Each analyze run pushes what it's replacing onto the front of this
-- array, newest first, capped in the callback.
--
-- style_history: [{ analyzed_at, palette, fonts }]

alter table site add column if not exists style_history jsonb;
