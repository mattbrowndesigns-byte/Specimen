-- Capture history: re-capturing a site used to overwrite its previous
-- screenshot (one row per site+viewport). Now every capture is kept, so a
-- site's detail page can show a timeline of how it changed over time --
-- which is the whole reason the Wayback Machine link exists.

alter table capture drop constraint if exists capture_site_id_viewport_key;

create index if not exists capture_site_viewport_time_idx
  on capture (site_id, viewport, captured_at desc);
