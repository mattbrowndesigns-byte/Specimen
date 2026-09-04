-- Favicons on cards, and a curated subset of discovered pages.
--
-- favicon_url is whatever the page's own <link rel="icon"> pointed at,
-- resolved absolute at save time. It's nullable and the UI falls back to
-- <origin>/favicon.ico, so existing rows need no backfill.
alter table site add column if not exists favicon_url text;

-- is_representative marks the pages worth showing: the handful that stand for
-- the site's page templates (a product detail, the shop archive, pricing, an
-- FAQ) rather than all thirty links in a mega-menu. Nothing is deleted -- the
-- full list stays behind "Show all", the same way component crops keep their
-- original image.
--
-- Default false means a site whose enrichment hasn't run (or failed) has none
-- flagged, and the UI treats "none flagged" as "show everything" so discovery
-- never silently looks empty.
alter table page add column if not exists is_representative boolean not null default false;

create index if not exists page_representative_idx
  on page (site_id) where is_representative;
