# Inspiration library — project spec

Hand this to Claude Code. It captures every decision made so far so nothing gets guessed at or reinvented.

---

## What this is

A personal design inspiration library for a web/UI designer. Replaces a Raindrop workflow that has stopped scaling.

**The problem being solved.** The owner saves roughly 100 well-designed sites for reference. Raindrop stores them as bookmarks with no useful structure, and tagging them by hand is too slow to actually do. So when he needs a reference for a specific pattern — say a tab-style block on a SaaS homepage, or a careers page — he opens dozens of tabs, scans each one by hand, closes the misses, and keeps the hits. This takes a long time and he loses good work as sites get redesigned.

**What success looks like.** He types "tab block" or clicks a tag and gets the four sites in his library that have one, with a screenshot proving it, in under five seconds.

**Secondary goal.** This is also a portfolio piece. He is a UI designer positioning himself as a product designer. The app should be good enough to show people, and the process should be documentable.

### Hard constraint: this must cost $0/month

Every architecture decision defers to this. No paid plans, no subscriptions, no surprise metered bills.

---

## Non-goals

Do not build these. They were considered and rejected.

- Comments, likes, hearts, follows, or any social features. It's a personal library.
- Sharing individual items publicly.
- A browser extension. Copy-paste of a URL is fine.
- A motion or animation tag facet. Explicitly not needed.
- Crawling and screenshotting every subpage of a site. Too expensive.
- Duplicate records for site redesigns. One record per site, updated in place.
- Full-text indexing of page body copy. Marketing copy is useless for design retrieval.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js on Vercel Hobby | Free. Owner has deployed to Vercel before. |
| Database | Supabase Postgres (free) | 500 MB is ample for text records. |
| Auth | Supabase Auth, magic link | No passwords to manage. |
| Image storage | Supabase Storage (free) | 1 GB, no credit card required. At WebP compression that is roughly 1,000 sites, against a current library of 100. Revisit at M6 if other users arrive. |
| Screenshots | Playwright in GitHub Actions | Public repos get unlimited free runner minutes. Replaces a $17/mo screenshot API. |
| AI enrichment | Free-tier LLM API (Gemini or Groq) | The task is classification against a closed list, which small models handle well. Anthropic Haiku is a paid alternative at fractions of a cent per save. |
| Search | Postgres full-text search | Built in. No search service needed. |

### Two setup items that must not be skipped

1. **Keep-alive ping.** Free Supabase projects pause after 7 days of inactivity and stay offline until manually restored. Add a GitHub Actions cron job that hits the database every 3 days. Note that Hobby-tier Vercel cron only runs once per day, so use GitHub Actions for this.
2. **Image compression.** Store WebP at quality 78, never PNG. A full-page PNG is 2–5 MB; the WebP equivalent is 300–500 KB. On the 1 GB free tier this is the difference between holding about 170 sites and holding about 1,000. It is not optional.

3. **Storage is deliberately Supabase, not Cloudflare R2.** R2 is technically better for an image-heavy app (10 GB, no egress charges) but requires a credit card on file even on the free tier. That trade is not worth making for a single-user library. Reassess at M6.

---

## Content model

```
site
  id, user_id, url, domain, name, summary, notes,
  saved_at, updated_at, needs_review (bool)

capture            belongs to site
  id, site_id, viewport ('desktop' | 'mobile'),
  full_url, thumb_url, captured_at, page_height

page               belongs to site  — discovered nav/footer links, no screenshots
  id, site_id, url, label, page_type

component          belongs to user, optionally belongs to site
  id, user_id, site_id (nullable), source_url,
  name, summary, notes, image_url, crop_rect, created_at

tag
  id, slug, label, facet, is_approved (bool)

taggable           polymorphic join: tag ↔ site | page | component
```

Notes for whoever implements this:

- `component.site_id` is nullable so a component can be captured from a URL whose parent site isn't in the library.
- `crop_rect` stores the region so a crop can be redone from the source capture without recapturing.
- Tags attach to sites, pages, and components alike, so one search spans all three.
- `is_approved` on tags is how new-tag drift is controlled. See below.
- Enable Row Level Security on every table **at M6, when auth is added — not before.** RLS blocks all table access until explicit policies exist, so turning it on during M1–M5 (which have no login and a single hardcoded user) means nothing reads or writes and the owner spends the evening debugging a guard around his own bookmarks. When M6 lands, enable it on every table in the same pass as auth, and verify each policy before moving on. Do not ship the public read-only view until RLS is on and tested.

### Tag facets

Tags are not a flat list. They belong to one of four facets, each drawn from a closed starting vocabulary. This is the most important structural decision in the app.

**Vertical** — ecommerce, SaaS, agency, portfolio, real estate, hospitality, fintech, healthcare, education, media

**Page type** — landing, pricing, about, careers, contact, resources, case study, blog index, dashboard, onboarding, integrations, demo request

**Block or pattern** — hero, tab block, bento grid, sticky nav, mega menu, pricing table, testimonial slider, logo wall, marquee, split screen, accordion, stat band, card grid, footer, CTA band

**Aesthetic** — minimal, editorial, brutalist, corporate, playful, dark, rounded, high contrast, type-led, image-led

**How drift is prevented.** The AI call receives the full approved vocabulary and is instructed to pick 1–2 tags per facet from that list only. It may propose at most one new tag per save, which is written with `is_approved = false` and shown in a pending state. The owner approves or rejects it from a settings screen. Free-form AI tagging without this control produces `minimal`, `minimalist`, and `clean minimal` within a hundred saves.

**Vocabulary management screen is required in v1**, not later. The owner has no existing tags to derive from, so the lists above are a first guess that will need revising after the first fifty saves. He needs to be able to rename, merge, and delete tags himself.

---

## The save flow

Speed is the whole point. The owner will not use this if saving takes effort. Target: paste a URL, press Return, done, under two seconds of his attention.

1. He pastes a URL and submits. No modal, no form.
2. The server immediately fetches the page HTML (fast, under a second) and creates the site record with the `<title>` or Open Graph `site_name` as the name. Only fall back to an AI call for the name if both are missing or junk.
3. From the same HTML fetch, extract nav and footer links and store them as `page` rows.
4. Fire the screenshot job and return. The record is already visible in the grid with a placeholder thumbnail.
5. Asynchronously: the AI enrichment call assigns tags, writes a 3–5 line summary, and classifies the discovered pages by type. The capture job uploads desktop and mobile WebP images plus 16:9 thumbnails.
6. The record is marked `needs_review = true`. A badge in the header shows the count.

The review queue is where he corrects AI output when he's in the mood, not at save time. This is the mechanism that makes zero-friction saving compatible with a well-tagged library.

### The capture job

The app calls GitHub's `repository_dispatch` endpoint with the URL and the site ID. A workflow runs Playwright, uploads the images to Supabase Storage, and calls back to a Next.js API route to write the URLs to the database. Round trip is 45–60 seconds.

**`capture.js` in this repo is proven working. Reuse it. Do not rewrite it.** It was validated against apple.com, stripe.com, rippling.com, and ramp.com in M0. Results: 4/4 desktop captures clean, 3/4 mobile. Every technique in it exists because a specific site broke without it.

What it already handles, and why each matters:

- **Realistic user agent.** Playwright's default identifies as `HeadlessChrome`. Ramp detected this and served a plain-text "machine version" of the site to the bot instead of the real page. A normal Chrome UA string fixed it completely. Do not remove this.
- **Scroll-through before capture.** Triggers lazy-loaded images and scroll-reveal sections. Without it, long pages come back with large blank regions.
- **Zeroed animation and transition durations**, plus `reducedMotion: 'reduce'`. Makes scroll-reveal elements land in their final state instantly instead of mid-fade.
- **Consent-banner selector list.** Hides common cookie platforms (OneTrust, Cookiebot, TrustArc, Osano). Extend the list as new ones turn up rather than replacing the approach.
- **Robust height measurement** across `body` and `documentElement`, scroll and offset heights.
- **20,000px clip guard.** Chromium becomes unreliable on taller captures.
- **Mobile fallback.** If a mobile capture comes back at roughly one viewport height, it retries with mobile emulation off at the same 390px width. When wiring this into the app, keep the *taller* of the two results; the M0 script simply overwrote, which is fine for a test but wrong for production.

Storage measured in M0, WebP quality 78: 400–970 KB per site for desktop full, mobile full, and desktop thumbnail combined. Longest page tested was 15,160px.

### Known capture edge cases

- **stripe.com mobile** returns exactly one viewport height (390 × 844) and cannot be fixed by scrolling, CSS overrides, or disabling mobile emulation. Its content is not in the document scroll. The desktop capture is perfect, so the record is still useful. Treat this as a category, not a one-off: some sites will only ever yield a desktop capture.
- Some sites will serve agent-readable text versions or block automation outright. Expect a small ongoing failure rate.

Because of the above, two things are required rather than optional:

1. A manual **re-capture** button on every site and every viewport.
2. A manual **image upload** fallback, so a site that never captures cleanly can still have a screenshot the owner took himself.

Also surface capture failures visibly. A record whose mobile capture came back at one viewport height should be flagged, not silently saved with a useless image.

---

## Screens

### Dashboard

Modelled on Dribbble's home screen, which the owner has cited as the reference.

- Two top-level tabs: **Websites** and **Components**
- One search bar, prominent
- A row of tag filter chips below it, grouped by facet
- A grid of 16:9 thumbnails, four across on desktop
- Each card: thumbnail, name, and a small external-link icon that opens the live site in a new tab directly from the grid without going into the detail page. This was specifically requested.
- Clicking the card body opens the detail page.

**Search must span everything**, not just tags: name, summary, notes, domain, tag labels, and discovered page labels. Use a generated `tsvector` column with a GIN index.

**Empty state**, for a newly signed-up user: a friendly illustration and a "Save your first site" call to action. It should feel like the beginning of something of theirs, not like a broken page.

### Detail page

- Full-page desktop capture, scrollable
- A toggle to switch to the mobile capture. This pairing is a core reason the app exists.
- Prominent **Visit site** button, opening the live URL in a new tab. The screenshot is a record of a moment; the live site is where he actually studies interactions, hover states, and responsive behavior. Both need to be first-class.
- Date saved, with a link to `web.archive.org/web/YYYYMMDD/<url>` so he can see the site as it was on that day
- The AI summary, editable inline
- Tags, grouped by facet, editable
- Notes field
- **Discovered pages** list, grouped by page type, each linking out to the live page. This is what replaces opening twenty tabs to find a careers page.
- Any components captured from this site
- Re-capture button

### Review queue

A filtered list of records where `needs_review = true`. Editing and saving clears the flag. Show pending unapproved tags here too.

### Tag management

Rename, merge, delete, reassign facet. Approve or reject pending tags.

---

## Milestones

Build in this order. Do not start the next one until the previous one works.

**M0 — Capture proof. DONE.** Playwright in GitHub Actions produces good screenshots of real sites, validated against four hard cases. See the capture section above for what was learned and what must not be changed.

**M1 — Walking skeleton.** Paste a URL, get a capture, see it in a grid. Single hardcoded user, no auth, no tags, no AI, no detail page. This wires up Next.js, Supabase, R2, and the dispatch-and-callback loop. It is the riskiest integration work in the project, so it happens while there's nothing else to debug.

**M2 — Enrichment.** AI naming, tagging against the facet vocabulary, and summaries. Tag management screen. Now it beats Raindrop.

**M3 — Retrieval.** Full-text search, facet filter chips, detail page, review queue. Now it's usable daily. **Stop here and use it for two weeks before building anything else.** Real use will change the tag vocabulary and reveal what's missing, and that feedback is worth more than more features.

**M4 — Components.** Paste a subpage URL, capture it, crop a region from the capture, AI names and tags the crop, save it to the Components tab. Requires a crop UI: drag a rectangle over the stored capture, store the rect, generate a cropped derivative. This mirrors an existing manual workflow, so it will get used immediately.

**M5 — Page discovery, properly.** Classify discovered nav and footer links into page types and make them searchable. The cheap design — extract links from one HTML fetch, classify with a small AI call, store as links with no screenshots — is deliberate. Crawling and capturing every subpage would multiply storage and capture cost tenfold for pages that would mostly never be looked at. Add an option to promote any single discovered page to a full capture on demand.

**M6 — Multi-user and public.** Supabase magic-link auth. Invite codes on signup, so cost exposure is capped at a number the owner controls rather than at whatever the internet does. Row Level Security enforced everywhere. Plus a public read-only view of the owner's own library at a stable URL, browsable with no account, which serves as the portfolio piece and the live demo. New accounts still start empty, with a friendly illustration and a "Save your first site" call to action.

This is also the point to migrate image storage to Cloudflare R2, since multiple users will exceed 1 GB and R2 has no egress charges. Not before.

---

## Things to get right that are easy to get wrong

- Store WebP, not PNG. Non-negotiable given the storage budget.
- Never interpolate a user-supplied URL directly into a shell command in a GitHub Actions workflow. Pass it through `env:`.
- No secrets in the repo. GitHub Secrets and Vercel environment variables only. The repo is public.
- Row Level Security is enabled at M6 with auth, not earlier. Enabling it during M1–M5 blocks everything and produces a confusing dead end.
- The keep-alive cron, or the app will silently go down after a quiet week.
- Don't make the owner wait on the screenshot at save time. The record must exist before the image does.
