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

  ["block_pattern", "hero", "Hero"],
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
