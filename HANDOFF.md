# Handoff — 30 Oct 2026

Read `CLAUDE.md` for conventions and the reasoning behind every gotcha, and
`02-project-spec.md` for the original requirements. This file is only about
*current state* and the decisions that live nowhere else.

- **Repo:** https://github.com/mattbrowndesigns-byte/Specimen
- **Local path:** `/Users/matthenriksen-brown/Documents/Specimen`
- **Live app:** https://specimen-gamma-six.vercel.app
- **Local `main` is at `43af8e1`.** GitHub has everything up to `559a8c9`.

## Outstanding, as of this writing

1. **`43af8e1` has not been pushed.** The dash sweep over user-facing copy.
   Everything before it is on GitHub.
2. **`supabase/schema_m19.sql` has not been run.** Two `capture_error` columns.
   Verified missing from the live database on 30 Oct. Nothing breaks without
   them; a failed capture just says nothing about why.
3. **`NEXT_PUBLIC_SHOWCASE_SHARE` is not set on Vercel.** Until it is,
   `/case-study` renders without its closing panel. Value is the share token
   for the read-only library; it is in `.env.local` already.

Everything up to and including `schema_m18.sql` is applied.

## Where the product is

M1 to M6 are built, deployed and in daily use. Beyond the original spec, the app
has since grown: a style reading per site (palette and typefaces measured in a
real browser), resources as a third library, scoped share links, a search field
with suggestions drawn from the library's own vocabulary, a block vocabulary
rebuilt around the Propel design system's families, an HTML-reading pass that
catches what a frozen screenshot cannot, and a bulk importer for bringing a
bookmarking app across in one paste.

Live counts on 30 Oct: **54 websites, 55 resources, 3 components, 266 tags,
8 share links.**

## Decisions that live only here

`CLAUDE.md` carries everything with a technical trap behind it. These are
product decisions with no trap, which is why they never earned an entry there,
and they should not be re-litigated without a reason.

- **Components always take a fresh capture** rather than reusing a site's
  stored screenshot. Simpler, and it matches the spec's wording.
- **`page.page_type` is a plain column**, not a tag link. A discovered page gets
  one cheap classification, not full multi-facet tagging.
- **Page discovery is capped at 30 links** per site and takes no screenshots.
- **Deleting a site keeps its components**, with `site_id` set to null.
- **The capture timeline is a horizontal scroll strip**, not a dropdown, not
  year grouping, not a "show more" expander. Chosen explicitly over all three.
- **Dates show the full year** ("Sep 3, 2026"), never a compact or
  conditional-year format. These records are meant to outlive the year.
- **Re-capture always regenerates the summary and tags** and re-flags for
  review, rather than preserving manual edits. Chosen knowing it overwrites a
  hand-edited summary.
- **Tags stay faceted.** The combobox UI was modelled on Dropmark's flat tag
  input, but faceting is the spec's most important structural decision. There
  are five facets now, not four: `resource_type` is the fifth and nothing in
  the website filters may touch it.

## Known and deliberately unfixed

- Gemini's own summaries can contain dashes. The no-dashes rule is held by
  editing source strings, and the model writes user-facing prose that nothing
  checks. Raised during the 30 Oct sweep and deliberately not closed.
- `.prose-lede` is capped in `ch`, the exact unit `CLAUDE.md` warns about. It
  is a short intro rather than a body measure, so it does little harm, but it
  is inconsistent.
- A stale worktree sits at `.claude/worktrees/suspicious-hellman-91f394`. Its
  branch is merged; the worktree and branch can both go.
- Six block tags from the m15 rename have no honest successor. `Hero` and
  `Footer` are still live and still pickable by the AI; they are family-only
  names, which match everything and find nothing. Merge them on `/tags`.
- A mobile capture that retries without device emulation overwrites the same
  file instead of keeping the taller result, which the spec wants. On the record
  since M0 and still true.

## Shared links are the portfolio surface now

A share link used to show a grid of screenshots that linked straight out to the
live sites, so everything the app had actually worked out about a site was
invisible to anyone without an account. A site card now opens
`/share/[token]/site/[id]`: the capture timeline, the measured palette, the
identified typefaces and the discovered pages, read-only, no session needed.

`/features`, `/about` and `/faq` are public as well, which they had to be --
they are what the shared footer and the invite panel point at.

The display name is set ("Matt"), so shared pages are headed "Matt's
Inspiration Library" and the old generic title is gone.

## Environment

`.env.local` is on this Mac with working keys, so `npm run dev` runs as-is.
Vercel environment variables and GitHub Actions secrets are set. `.env.example`
lists every name the project reads.

`git push` is blocked by the sandbox here — commit normally, then push from
**GitHub Desktop → Repository → Push**. Claude.app also needs Full Disk Access
in macOS System Settings or every file read fails.

**If tags or typefaces ever stop filling themselves in,** check that
`enrich-queue.yml` is still enabled. GitHub disables scheduled workflows on a
repo that has seen no activity for 60 days, and that one workflow drains all
three queues every fifteen minutes.
