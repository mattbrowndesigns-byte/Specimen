// The vocabulary a new account starts with.
//
// This has to live in code, not only in SQL. Vocabularies are per account now,
// so the seed that ran once in schema_m2 belongs to whoever claimed it -- a new
// account created afterwards started with nothing, and the AI is instructed to
// pick only from values that exist, so it picked nothing at all. Every account
// needs its own copy at the moment it's created.
//
// Approved on arrival: these are the curated starting point, not AI proposals.
// Renaming or deleting any of them afterwards is per account and immediately
// changes what that account's AI may choose.
export const STARTER_TAGS = [
  ["vertical", "ecommerce", "Ecommerce"],
  ["vertical", "saas", "SaaS"],
  ["vertical", "agency", "Agency"],
  ["vertical", "portfolio", "Portfolio"],
  ["vertical", "real-estate", "Real Estate"],
  ["vertical", "hospitality", "Hospitality"],
  ["vertical", "fintech", "Fintech"],
  ["vertical", "healthcare", "Healthcare"],
  ["vertical", "education", "Education"],
  ["vertical", "media", "Media"],

  ["page_type", "homepage", "Homepage"],
  ["page_type", "landing", "Landing"],
  ["page_type", "pricing", "Pricing"],
  ["page_type", "about", "About"],
  ["page_type", "careers", "Careers"],
  ["page_type", "contact", "Contact"],
  ["page_type", "resources", "Resources"],
  ["page_type", "case-study", "Case Study"],
  ["page_type", "blog-index", "Blog Index"],
  ["page_type", "dashboard", "Dashboard"],
  ["page_type", "onboarding", "Onboarding"],
  ["page_type", "integrations", "Integrations"],
  ["page_type", "demo-request", "Demo Request"],
  ["page_type", "product-detail", "Product Detail"],
  ["page_type", "product-archive", "Product Archive"],
  ["page_type", "faq", "FAQ"],
  ["page_type", "subscription", "Subscription"],

  // Nav, hero and footer are on every site ever made, so tagging them by name
  // says nothing and searching for them returns everything. They're only worth
  // recording as a *variety* -- which footer, which hero -- and that's what
  // makes "show me sites with comprehensive footers" a question the library
  // can actually answer.
  ["block_pattern", "image-hero", "Image Hero"],
  ["block_pattern", "video-hero", "Video Hero"],
  ["block_pattern", "type-hero", "Type-Led Hero"],
  ["block_pattern", "split-hero", "Split Hero"],
  ["block_pattern", "product-hero", "Product Shot Hero"],
  ["block_pattern", "form-hero", "Hero With Form"],
  ["block_pattern", "minimal-footer", "Minimal Footer"],
  ["block_pattern", "mega-footer", "Mega Footer"],
  ["block_pattern", "cta-footer", "Footer With CTA"],
  ["block_pattern", "simple-nav", "Simple Nav"],
  ["block_pattern", "tab-block", "Tab Block"],
  ["block_pattern", "bento-grid", "Bento Grid"],
  ["block_pattern", "sticky-nav", "Sticky Nav"],
  ["block_pattern", "mega-menu", "Mega Menu"],
  ["block_pattern", "pricing-table", "Pricing Table"],
  ["block_pattern", "testimonial-slider", "Testimonial Slider"],
  ["block_pattern", "logo-wall", "Logo Wall"],
  ["block_pattern", "marquee", "Marquee"],
  ["block_pattern", "split-screen", "Split Screen"],
  ["block_pattern", "accordion", "Accordion"],
  ["block_pattern", "stat-band", "Stat Band"],
  ["block_pattern", "card-grid", "Card Grid"],
  ["block_pattern", "footer", "Footer"],
  ["block_pattern", "cta-band", "CTA Band"],
  ["block_pattern", "feature-split", "Image + Content Split"],
  ["block_pattern", "feature-list", "Feature List"],
  ["block_pattern", "comparison-table", "Comparison Table"],
  ["block_pattern", "faq-block", "FAQ Block"],
  ["block_pattern", "step-process", "Step / Process"],
  ["block_pattern", "timeline", "Timeline"],
  ["block_pattern", "team-grid", "Team Grid"],
  ["block_pattern", "case-study-grid", "Case Study Grid"],
  ["block_pattern", "blog-teaser", "Blog Teaser"],
  ["block_pattern", "newsletter-signup", "Newsletter Signup"],
  ["block_pattern", "integration-grid", "Integration Grid"],
  ["block_pattern", "video-embed", "Video Embed"],
  ["block_pattern", "product-carousel", "Product Carousel"],
  ["block_pattern", "before-after", "Before / After"],
  ["block_pattern", "code-block", "Code Sample"],
  ["block_pattern", "map-block", "Map Block"],
  ["block_pattern", "quote-feature", "Pull Quote"],
  ["block_pattern", "banner-strip", "Announcement Bar"],

  ["aesthetic", "minimal", "Minimal"],
  ["aesthetic", "editorial", "Editorial"],
  ["aesthetic", "brutalist", "Brutalist"],
  ["aesthetic", "corporate", "Corporate"],
  ["aesthetic", "playful", "Playful"],
  ["aesthetic", "dark", "Dark"],
  ["aesthetic", "rounded", "Rounded"],
  ["aesthetic", "high-contrast", "High Contrast"],
  ["aesthetic", "type-led", "Type-Led"],
  ["aesthetic", "image-led", "Image-Led"],
];

// Safe to call on an account that already has some: the unique index on
// (user_id, facet, slug) means existing rows are skipped rather than doubled.
export async function seedStarterTags(supabase, userId) {
  const rows = STARTER_TAGS.map(([facet, slug, label]) => ({
    user_id: userId,
    facet,
    slug,
    label,
    is_approved: true,
  }));
  const { error } = await supabase
    .from("tag")
    .upsert(rows, { onConflict: "user_id,facet,slug", ignoreDuplicates: true });
  return error;
}
