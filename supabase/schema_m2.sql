-- M2: tag vocabulary + polymorphic tagging, seeded with the closed
-- starting vocabulary from the spec. Run this after schema.sql.

create table if not exists tag (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  label text not null,
  facet text not null check (facet in ('vertical', 'page_type', 'block_pattern', 'aesthetic')),
  is_approved boolean not null default true,
  created_at timestamptz not null default now(),
  unique (facet, slug)
);

create table if not exists taggable (
  id uuid primary key default gen_random_uuid(),
  tag_id uuid not null references tag(id) on delete cascade,
  target_type text not null check (target_type in ('site', 'page', 'component')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (tag_id, target_type, target_id)
);

create index if not exists taggable_target_idx on taggable (target_type, target_id);

insert into tag (facet, slug, label) values
  ('vertical', 'ecommerce', 'Ecommerce'),
  ('vertical', 'saas', 'SaaS'),
  ('vertical', 'agency', 'Agency'),
  ('vertical', 'portfolio', 'Portfolio'),
  ('vertical', 'real-estate', 'Real Estate'),
  ('vertical', 'hospitality', 'Hospitality'),
  ('vertical', 'fintech', 'Fintech'),
  ('vertical', 'healthcare', 'Healthcare'),
  ('vertical', 'education', 'Education'),
  ('vertical', 'media', 'Media'),

  ('page_type', 'landing', 'Landing'),
  ('page_type', 'pricing', 'Pricing'),
  ('page_type', 'about', 'About'),
  ('page_type', 'careers', 'Careers'),
  ('page_type', 'contact', 'Contact'),
  ('page_type', 'resources', 'Resources'),
  ('page_type', 'case-study', 'Case Study'),
  ('page_type', 'blog-index', 'Blog Index'),
  ('page_type', 'dashboard', 'Dashboard'),
  ('page_type', 'onboarding', 'Onboarding'),
  ('page_type', 'integrations', 'Integrations'),
  ('page_type', 'demo-request', 'Demo Request'),

  ('block_pattern', 'hero', 'Hero'),
  ('block_pattern', 'tab-block', 'Tab Block'),
  ('block_pattern', 'bento-grid', 'Bento Grid'),
  ('block_pattern', 'sticky-nav', 'Sticky Nav'),
  ('block_pattern', 'mega-menu', 'Mega Menu'),
  ('block_pattern', 'pricing-table', 'Pricing Table'),
  ('block_pattern', 'testimonial-slider', 'Testimonial Slider'),
  ('block_pattern', 'logo-wall', 'Logo Wall'),
  ('block_pattern', 'marquee', 'Marquee'),
  ('block_pattern', 'split-screen', 'Split Screen'),
  ('block_pattern', 'accordion', 'Accordion'),
  ('block_pattern', 'stat-band', 'Stat Band'),
  ('block_pattern', 'card-grid', 'Card Grid'),
  ('block_pattern', 'footer', 'Footer'),
  ('block_pattern', 'cta-band', 'CTA Band'),

  ('aesthetic', 'minimal', 'Minimal'),
  ('aesthetic', 'editorial', 'Editorial'),
  ('aesthetic', 'brutalist', 'Brutalist'),
  ('aesthetic', 'corporate', 'Corporate'),
  ('aesthetic', 'playful', 'Playful'),
  ('aesthetic', 'dark', 'Dark'),
  ('aesthetic', 'rounded', 'Rounded'),
  ('aesthetic', 'high-contrast', 'High Contrast'),
  ('aesthetic', 'type-led', 'Type-Led'),
  ('aesthetic', 'image-led', 'Image-Led')
on conflict (facet, slug) do nothing;
