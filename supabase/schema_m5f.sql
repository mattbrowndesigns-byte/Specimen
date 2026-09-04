-- Two unrelated fixes that both need SQL, so they run as one step.

-- 1. How a site's icon should be drawn in its badge.
--
-- Some icons are full-bleed brand tiles (Airbnb, Vercel, Rippling all ship an
-- apple-touch-icon with an opaque background) and should fill the circle. The
-- rest are a bare mark on transparency (Apple, IBM, IKEA) and have to be inset,
-- or the circle crops the artwork. That can't be told from the URL, so it's
-- measured once when the icon is stored -- the corners are sampled and the
-- answer cached here.
--
-- Defaults true, which is the behaviour rows already have.
alter table site add column if not exists favicon_fills boolean not null default true;

-- 2. Page types for commerce.
--
-- The AI may only pick page_type values that exist in this table, so a store's
-- pages had nothing to be classified as: every product page and every
-- collection listing came back as "Landing" or null. These four are the
-- templates a commerce site actually has.
--
-- Approved on insert, like a manually typed tag -- these are a considered
-- addition to the vocabulary, not an AI proposal. Delete or rename any of them
-- on the Manage tags page and the AI stops using it immediately.
insert into tag (facet, slug, label) values
  ('page_type', 'product-detail', 'Product Detail'),
  ('page_type', 'product-archive', 'Product Archive'),
  ('page_type', 'faq', 'FAQ'),
  ('page_type', 'subscription', 'Subscription')
on conflict (facet, slug) do nothing;
