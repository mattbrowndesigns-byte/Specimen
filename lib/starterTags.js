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

  // Blocks are named family-then-variety, and the variety is the whole point.
  //
  // Every site on the internet has a hero and a footer, so "Hero" and "Footer"
  // are words that match everything and therefore find nothing. The old list
  // had both of those as pickable values while the prompt told the model not
  // to use them, and a closed list beats an instruction every time:
  // 829studios.com came back tagged Footer, Card Grid, Tab Block, CTA Band and
  // Logo Wall, five bare nouns that describe most of the web.
  //
  // The families come from the Propel design system, which is the vocabulary
  // this library's owner already designs in -- Hero, Logo, Card, Text, Media,
  // Stat, Tab, Accordion, Testimonial, CTA, Layout, Table, Archive -- plus Nav
  // and Footer, which Propel treats as global chrome rather than blocks. The
  // varieties are the ones a designer can see in a screenshot and would search
  // for later: what carries the block, how it is laid out, whether it moves.
  //
  // Standalone patterns survive at the bottom only where they are already
  // specific enough to find something. Anything that was a family in disguise
  // moved into one: Stat Band became Stat Strip, Bento Grid became Card Bento,
  // Pricing Table and Comparison Table became Table varieties.

  ["block_pattern", "hero-standard", "Hero Standard"],
  ["block_pattern", "hero-centered", "Hero Centered"],
  ["block_pattern", "hero-split", "Hero Split"],
  ["block_pattern", "hero-display-type", "Hero Display Type"],
  ["block_pattern", "hero-carousel", "Hero Carousel"],
  ["block_pattern", "hero-video", "Hero Video"],
  ["block_pattern", "hero-image", "Hero Image"],
  ["block_pattern", "hero-framed", "Hero Framed"],
  ["block_pattern", "hero-search", "Hero Search"],
  ["block_pattern", "hero-form", "Hero Form"],
  ["block_pattern", "hero-product", "Hero Product"],

  ["block_pattern", "nav-simple", "Nav Simple"],
  ["block_pattern", "nav-sticky", "Nav Sticky"],
  ["block_pattern", "nav-mega", "Nav Mega"],
  ["block_pattern", "nav-sidebar", "Nav Sidebar"],

  ["block_pattern", "footer-minimal", "Footer Minimal"],
  ["block_pattern", "footer-mega", "Footer Mega"],
  ["block_pattern", "footer-cta", "Footer CTA"],
  ["block_pattern", "footer-sitemap", "Footer Sitemap"],

  ["block_pattern", "logo-strip", "Logo Strip"],
  ["block_pattern", "logo-carousel", "Logo Carousel"],
  ["block_pattern", "logo-grid", "Logo Grid"],

  ["block_pattern", "card-grid", "Card Grid"],
  ["block_pattern", "card-carousel", "Card Carousel"],
  ["block_pattern", "card-column", "Card Column"],
  ["block_pattern", "card-bento", "Card Bento"],

  ["block_pattern", "text-lead", "Text Lead"],
  ["block_pattern", "text-intro", "Text Intro"],
  ["block_pattern", "text-rows", "Text Rows"],
  ["block_pattern", "text-side-heading", "Text Side Heading"],
  ["block_pattern", "text-checklist", "Text Checklist"],
  ["block_pattern", "text-columns", "Text Columns"],

  ["block_pattern", "media-standard", "Media Standard"],
  ["block_pattern", "media-carousel", "Media Carousel"],
  ["block_pattern", "media-grid", "Media Grid"],
  ["block_pattern", "media-full-bleed", "Media Full Bleed"],
  ["block_pattern", "media-thumbnail", "Media Thumbnail"],
  ["block_pattern", "media-video-embed", "Media Video Embed"],

  ["block_pattern", "layout-side-image", "Layout Side Image"],
  ["block_pattern", "layout-column", "Layout Column"],
  ["block_pattern", "layout-column-side", "Layout Column Side"],

  ["block_pattern", "stat-strip", "Stat Strip"],
  ["block_pattern", "stat-grid", "Stat Grid"],
  ["block_pattern", "stat-side", "Stat Side"],
  ["block_pattern", "stat-image", "Stat Image"],

  ["block_pattern", "tab-top", "Tab Top"],
  ["block_pattern", "tab-side", "Tab Side"],

  ["block_pattern", "accordion-standard", "Accordion Standard"],
  ["block_pattern", "accordion-side", "Accordion Side"],
  ["block_pattern", "accordion-image", "Accordion Image"],

  ["block_pattern", "testimonial-standard", "Testimonial Standard"],
  ["block_pattern", "testimonial-card", "Testimonial Card"],
  ["block_pattern", "testimonial-box", "Testimonial Box"],
  ["block_pattern", "testimonial-carousel", "Testimonial Carousel"],
  ["block_pattern", "testimonial-image", "Testimonial Image"],

  ["block_pattern", "cta-standard", "CTA Standard"],
  ["block_pattern", "cta-streamline", "CTA Streamline"],
  ["block_pattern", "cta-grid", "CTA Grid"],
  ["block_pattern", "cta-form", "CTA Form"],
  ["block_pattern", "cta-banner", "CTA Banner"],

  ["block_pattern", "table-standard", "Table Standard"],
  ["block_pattern", "table-comparison", "Table Comparison"],
  ["block_pattern", "table-pricing", "Table Pricing"],

  ["block_pattern", "archive-grid", "Archive Grid"],
  ["block_pattern", "archive-sidebar", "Archive Sidebar"],
  ["block_pattern", "archive-filter-top", "Archive Filter Top"],
  ["block_pattern", "archive-filter-side", "Archive Filter Side"],

  // Specific enough on their own to find something, so they keep their names.
  ["block_pattern", "marquee", "Marquee"],
  ["block_pattern", "timeline", "Timeline"],
  ["block_pattern", "step-process", "Step / Process"],
  ["block_pattern", "team-grid", "Team Grid"],
  ["block_pattern", "map-block", "Map Block"],
  ["block_pattern", "quote-feature", "Pull Quote"],
  ["block_pattern", "code-block", "Code Sample"],
  ["block_pattern", "before-after", "Before / After"],
  ["block_pattern", "newsletter-signup", "Newsletter Signup"],
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

  // The fifth facet, and the only one a resource uses. Kept separate from the
  // four above on purpose: those describe how a page is designed, which says
  // nothing about an icon set, and mixing them would put words in the
  // dashboard's tag strip that no website can ever match.
  ["resource_type", "icons", "Icons"],
  ["resource_type", "illustration", "Illustration"],
  ["resource_type", "photography", "Photography"],
  ["resource_type", "type", "Type"],
  ["resource_type", "colour", "Colour"],
  ["resource_type", "mockups", "Mockups"],
  ["resource_type", "motion", "Motion"],
  ["resource_type", "ai", "AI"],
  ["resource_type", "dev-tools", "Dev Tools"],
  ["resource_type", "prototyping", "Prototyping"],
  ["resource_type", "accessibility", "Accessibility"],
  ["resource_type", "templates", "Templates"],
  ["resource_type", "reading", "Reading"],
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
