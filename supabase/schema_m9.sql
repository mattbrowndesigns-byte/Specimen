-- M9: dates for the things the panel can now re-run, a short name for a
-- discovered page, and a way to keep a site out of the dashboard.
--
-- pages_read_at / enriched_at exist so every panel that offers a "re-read"
-- can say when it last read. Without them the only timestamp is the site's
-- updated_at, which any edit moves and which therefore answers a different
-- question.
--
-- page.utility_label is what the page *is* rather than what its link happened
-- to say: "About Us", "Request A Demo", "Product Detail". Nav labels are
-- written for the site's own visitors ("Why us", "Get started free") and are
-- no use for comparing one site's page set against another's.
--
-- is_hidden keeps a site in the library and out of the dashboard grid.

alter table site add column if not exists pages_read_at timestamptz;
alter table site add column if not exists enriched_at timestamptz;
alter table site add column if not exists is_hidden boolean not null default false;

alter table page add column if not exists utility_label text;

-- The dashboard filters on this on every load.
create index if not exists site_user_hidden_idx on site (user_id, is_hidden);
