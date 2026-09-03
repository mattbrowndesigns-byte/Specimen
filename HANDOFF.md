# Handoff — 3 Sep 2026

Read `CLAUDE.md` for conventions and gotchas, and `02-project-spec.md` for the
original requirements. This file is only about *current state*.

- **Repo:** https://github.com/mattbrowndesigns-byte/Specimen
- **Local path:** `/Users/matthenriksen-brown/Documents/Specimen`
- **Live app:** https://specimen-pied.vercel.app
- **Everything is committed and pushed.** `main` local == remote at `07a32cd`.

## Where we are

**Milestones M1–M5 are built, deployed, and verified working end-to-end on the
live site. M6 has not been started.**

The spec's milestone order was followed exactly. Each was tested live (real URL
saved → real GitHub Actions capture → real AI enrichment) before moving on:

- **M1** Paste a URL → screenshot appears in a grid. The dispatch-and-callback
  loop (Next.js → `repository_dispatch` → Playwright in Actions → upload to
  Supabase Storage → callback writes URLs) works.
- **M2** Gemini looks at the desktop screenshot and assigns tags from the
  closed four-facet vocabulary, writes a summary, and can propose one new tag
  (pending approval). Tag-management screen at `/tags` (rename, merge, delete,
  reassign facet, approve/reject).
- **M3** Postgres full-text search (`search_sites` RPC, also matches tag labels
  and discovered page labels), facet filter chips, per-site detail page,
  review queue at `/review`.
- **M4** Components: paste any page URL → capture → drag a crop → Gemini names,
  summarizes and tags the crop. Re-crop from the stored original. Components
  auto-link to an existing site by domain.
- **M5** Page discovery: nav/footer links extracted from the HTML fetch already
  happening at save time (capped at 30), classified into page types by the same
  enrichment call, listed on the detail page grouped by type, each promotable to
  a full capture.

Then, at the owner's request (post-M5, off-spec):
- Capture **history timeline** — re-capture no longer overwrites; the detail
  page shows a horizontally scrolling strip of full dates ("Sep 3, 2026"),
  newest on the right, and you can view the site as it looked then. Each
  capture carries its own Wayback Machine link for that date and can be
  deleted on its own (rows plus stored image files).
- **Delete a saved site** (previously only components could be deleted).
- Tag editing rebuilt as an inline **combobox** (chips in the field, live
  filter, usage counts, type-to-create).
- Crop tool rebuilt with **8 drag handles** + movable body + Redraw.

## Known issues / half-finished

1. **Two sites are permanently stuck at "Capturing…"**:
   `966cf119` (stripe.com) and `274d081f` (ramp.com). They have zero capture
   rows because they were saved before the `Captures` bucket-name bug was
   fixed, and were never re-captured. Either hit Re-capture on each, or delete
   them (site delete now exists). They're the only records with no captures.
2. **A pending component capture isn't resumable.** If you close or refresh the
   tab while a component's page capture is running, there's no way back to the
   crop step — the `component_capture` row is orphaned and invisible. Sites
   don't have this problem because the site row exists immediately.
3. **Capture history grows storage unboundedly.** Each re-capture adds
   ~400–970 KB instead of replacing. Fine at current scale (8 capture rows) on
   Supabase's free 1 GB, and single runs can now be deleted by hand, but
   nothing prunes automatically. If it matters later, cap at the last N runs.
4. **Re-capture overwrites a hand-edited summary.** Enrichment re-runs on every
   capture and rewrites `summary`, re-adds tags, and re-flags `needs_review`.
   This is the owner's explicit choice (sites redesign, so descriptions should
   refresh) — not a bug to "fix" without asking. Note tags are additive: the
   AI never removes tags, so a manually removed tag can come back.
5. **stripe.com mobile can't be captured** — returns exactly one viewport
   height and can't be fixed by scrolling or disabling emulation. The spec
   flags this as a category, not a one-off: some sites will only ever yield a
   desktop capture.
6. Manual image upload as a capture fallback (spec calls it "required rather
   than optional") is **not built**. Re-capture is.
7. Deleting stored images leaves the old public URL served from Supabase's CDN
   for a while. Harmless — nothing references it — but don't treat a 200 on an
   old capture URL as proof the file survived. Check the storage listing.
8. Four sites currently sit in the review queue (`needs_review = true`). That's
   expected state, not a bug.

## Next step

Start **M6**: Supabase magic-link auth, invite codes on signup, RLS enabled and
tested on every table, plus a public read-only view of the library at a stable
URL as the portfolio piece. M6 is also where the spec says to migrate image
storage to Cloudflare R2 — **not before**.

Note the spec says to stop after M3 and use the app for two weeks before
building more. The owner explicitly chose to keep going ("this just feels
incomplete to me right now"). Don't re-litigate that.

## Decisions already made — don't reverse these

- **`capture.js` is never edited.** Including its known mobile-retry overwrite
  behavior. See CLAUDE.md.
- **RLS stays off until M6**, in the same pass as auth.
- **Enrichment runs `await`ed in the callback route, not via `after()`.**
  `after()` silently never executed on this deployment.
- **`Cache-Control: no-store` headers in `next.config.js` stay.** They're the
  fix for stale deploys; `force-dynamic` doesn't work on client pages.
- **No scroll clipping around full-page captures** (`overflow: auto` +
  `max-height` corrupts tall screenshots).
- **Tags stay faceted** (four facets), even though the combobox UI was modeled
  on Dropmark's flat tag input. The facets are the spec's most important
  structural decision.
- **Components always take a fresh capture** rather than reusing an existing
  site's stored screenshot. Simpler and matches the spec's wording.
- **`page.page_type` is a plain column**, not a tag link — discovered pages get
  one cheap classification, not full multi-facet tagging.
- **Gemini, not Groq** — visual facets need vision.
- **Page discovery is capped at 30 links** per site and takes no screenshots.
- Deleting a site keeps its components (with `site_id` set to null).
- **Timeline is a horizontal scroll strip**, not a dropdown, year grouping, or
  a "show more" expander. Owner chose this explicitly over those three.
- **Dates show the full year** ("Sep 3, 2026"), not a compact or
  conditional-year format. These records are meant to outlive the year.
- **Re-capture always regenerates the AI summary and tags** and re-flags for
  review, rather than preserving manual edits or hiding behind a separate
  button. Owner chose this knowing it overwrites hand-edited summaries.

## Environment notes

`.env.local` is already present on this Mac with all working keys, so the app
runs locally as-is (`npm run dev`). Vercel env vars and GitHub Actions secrets
are all set. Migrations in `supabase/schema*.sql` have all been applied by hand
in order, including `schema_m5b.sql` (verified: the timeline's second capture
run inserted successfully, which requires that migration's dropped constraint).

`git push` is blocked by the sandbox here — commit normally, then push from
**GitHub Desktop → Repository → Push**. Claude.app also needs Full Disk Access
in macOS System Settings or every file read fails.
