-- M15: block_pattern becomes family-then-variety.
--
-- Why: every site has a hero, a nav and a footer, so "Hero" and "Footer" match
-- everything and find nothing. The vocabulary now names the family AND how this
-- one differs, using the families from the Propel design system the owner
-- already designs in. See lib/starterTags.js.
--
-- This migration preserves links. Renaming a tag keeps every row in `taggable`
-- that points at it, so a site tagged "Logo Wall" is tagged "Logo Strip"
-- afterwards without anything being re-enriched. Only tags with no honest
-- one-to-one successor are left alone, and those are listed at the bottom for
-- merging by hand on the Manage Tags page.
--
-- Idempotent: every rename is skipped if the new slug already exists in that
-- account, and every insert is `on conflict do nothing`.

-- 1. Rename, per account, where the old tag has exactly one successor.
--    Plain SQL rather than a loop: this gets pasted into the SQL editor by
--    hand, so it is worth being boring. Every new slug below appears once, so
--    no two renames can collide with each other.
update tag t
   set slug = m.new_slug, label = m.new_label
  from (values
    ('image-hero',         'hero-image',           'Hero Image'),
    ('video-hero',         'hero-video',           'Hero Video'),
    ('type-hero',          'hero-display-type',    'Hero Display Type'),
    ('split-hero',         'hero-split',           'Hero Split'),
    ('product-hero',       'hero-product',         'Hero Product'),
    ('form-hero',          'hero-form',            'Hero Form'),
    ('minimal-footer',     'footer-minimal',       'Footer Minimal'),
    ('mega-footer',        'footer-mega',          'Footer Mega'),
    ('cta-footer',         'footer-cta',           'Footer CTA'),
    ('simple-nav',         'nav-simple',           'Nav Simple'),
    ('sticky-nav',         'nav-sticky',           'Nav Sticky'),
    ('mega-menu',          'nav-mega',             'Nav Mega'),
    ('logo-wall',          'logo-strip',           'Logo Strip'),
    ('integration-grid',   'logo-grid',            'Logo Grid'),
    ('bento-grid',         'card-bento',           'Card Bento'),
    ('product-carousel',   'card-carousel',        'Card Carousel'),
    ('feature-list',       'text-checklist',       'Text Checklist'),
    ('video-embed',        'media-video-embed',    'Media Video Embed'),
    ('split-screen',       'layout-side-image',    'Layout Side Image'),
    ('stat-band',          'stat-strip',           'Stat Strip'),
    ('tab-block',          'tab-top',              'Tab Top'),
    ('accordion',          'accordion-standard',   'Accordion Standard'),
    ('testimonial-slider', 'testimonial-carousel', 'Testimonial Carousel'),
    ('cta-band',           'cta-banner',           'CTA Banner'),
    ('pricing-table',      'table-pricing',        'Table Pricing'),
    ('comparison-table',   'table-comparison',     'Table Comparison')
  ) as m(old_slug, new_slug, new_label)
 where t.facet = 'block_pattern'
   and t.slug = m.old_slug
   and not exists (
     select 1 from tag o
      where o.facet = 'block_pattern'
        and o.slug = m.new_slug
        and o.user_id is not distinct from t.user_id
   );

-- 2. Seed the rest of the vocabulary into every account that already exists.
--    New accounts get the whole list from lib/starterTags.js on signup.
insert into tag (facet, slug, label, is_approved, user_id)
select 'block_pattern', v.slug, v.label, true, u.user_id
from (select distinct user_id from tag where user_id is not null) u
cross join (values
  ('hero-standard',        'Hero Standard'),
  ('hero-centered',        'Hero Centered'),
  ('hero-split',           'Hero Split'),
  ('hero-display-type',    'Hero Display Type'),
  ('hero-carousel',        'Hero Carousel'),
  ('hero-video',           'Hero Video'),
  ('hero-image',           'Hero Image'),
  ('hero-framed',          'Hero Framed'),
  ('hero-search',          'Hero Search'),
  ('hero-form',            'Hero Form'),
  ('hero-product',         'Hero Product'),
  ('nav-simple',           'Nav Simple'),
  ('nav-sticky',           'Nav Sticky'),
  ('nav-mega',             'Nav Mega'),
  ('nav-sidebar',          'Nav Sidebar'),
  ('footer-minimal',       'Footer Minimal'),
  ('footer-mega',          'Footer Mega'),
  ('footer-cta',           'Footer CTA'),
  ('footer-sitemap',       'Footer Sitemap'),
  ('logo-strip',           'Logo Strip'),
  ('logo-carousel',        'Logo Carousel'),
  ('logo-grid',            'Logo Grid'),
  ('card-grid',            'Card Grid'),
  ('card-carousel',        'Card Carousel'),
  ('card-column',          'Card Column'),
  ('card-bento',           'Card Bento'),
  ('text-lead',            'Text Lead'),
  ('text-intro',           'Text Intro'),
  ('text-rows',            'Text Rows'),
  ('text-side-heading',    'Text Side Heading'),
  ('text-checklist',       'Text Checklist'),
  ('text-columns',         'Text Columns'),
  ('media-standard',       'Media Standard'),
  ('media-carousel',       'Media Carousel'),
  ('media-grid',           'Media Grid'),
  ('media-full-bleed',     'Media Full Bleed'),
  ('media-thumbnail',      'Media Thumbnail'),
  ('media-video-embed',    'Media Video Embed'),
  ('layout-side-image',    'Layout Side Image'),
  ('layout-column',        'Layout Column'),
  ('layout-column-side',   'Layout Column Side'),
  ('stat-strip',           'Stat Strip'),
  ('stat-grid',            'Stat Grid'),
  ('stat-side',            'Stat Side'),
  ('stat-image',           'Stat Image'),
  ('tab-top',              'Tab Top'),
  ('tab-side',             'Tab Side'),
  ('accordion-standard',   'Accordion Standard'),
  ('accordion-side',       'Accordion Side'),
  ('accordion-image',      'Accordion Image'),
  ('testimonial-standard', 'Testimonial Standard'),
  ('testimonial-card',     'Testimonial Card'),
  ('testimonial-box',      'Testimonial Box'),
  ('testimonial-carousel', 'Testimonial Carousel'),
  ('testimonial-image',    'Testimonial Image'),
  ('cta-standard',         'CTA Standard'),
  ('cta-streamline',       'CTA Streamline'),
  ('cta-grid',             'CTA Grid'),
  ('cta-form',             'CTA Form'),
  ('cta-banner',           'CTA Banner'),
  ('table-standard',       'Table Standard'),
  ('table-comparison',     'Table Comparison'),
  ('table-pricing',        'Table Pricing'),
  ('archive-grid',         'Archive Grid'),
  ('archive-sidebar',      'Archive Sidebar'),
  ('archive-filter-top',   'Archive Filter Top'),
  ('archive-filter-side',  'Archive Filter Side'),
  ('marquee',              'Marquee'),
  ('timeline',             'Timeline'),
  ('step-process',         'Step / Process'),
  ('team-grid',            'Team Grid'),
  ('map-block',            'Map Block'),
  ('quote-feature',        'Pull Quote'),
  ('code-block',           'Code Sample'),
  ('before-after',         'Before / After'),
  ('newsletter-signup',    'Newsletter Signup'),
  ('banner-strip',         'Announcement Bar')
) as v(slug, label)
on conflict do nothing;

-- 3. Left for you, on purpose.
--
-- These old tags have no single honest successor, so nothing here guesses one.
-- They are still pickable by the AI until you deal with them, and the Manage
-- Tags page will merge each into whichever new value is right for your library
-- (with an Undo if you change your mind):
--
--   Footer            -> a real footer variety, once you look at what they are
--   FAQ Block         -> usually Accordion Standard
--   Feature Split     -> usually Layout Side Image
--   Image + Content Split -> usually Layout Side Image
--   Case Study Grid   -> usually Card Grid
--   Blog Teaser       -> usually Card Grid
--
-- Delete rather than merge if a tag is on nothing.
