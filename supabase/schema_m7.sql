-- M7: what a site's interface is made of -- the colours it paints and the
-- typefaces it renders, measured in a real browser by analyze.js.
--
-- Columns on `site` rather than tables of their own. This data is always read
-- with the site and never queried across rows, so a join would buy nothing --
-- and it inherits the site's own RLS instead of needing a policy, a user_id
-- and a scoped query in every route, which is the part that's easy to get
-- wrong.
--
-- palette: [{ hex, share, role }]  share is 0-1 of measured painted area;
--          role is background | text | border | graphic.
-- fonts:   [{ family, share, display_share, max_size, source_host,
--             display_name, foundry, foundry_url, provider, classification,
--             is_custom, google, adobe }]
--          google/adobe are { family, url, note } or absent -- only ever set
--          when the link has been checked and answered 200.

alter table site add column if not exists palette jsonb;
alter table site add column if not exists fonts jsonb;
alter table site add column if not exists analyzed_at timestamptz;
