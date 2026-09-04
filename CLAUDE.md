# Specimen — working notes

A personal design-inspiration library for a UI/product designer. Replaces a
Raindrop workflow: paste a URL, get an auto-captured screenshot plus
AI-assigned tags and a summary, then find it later in under five seconds. Full
requirements live in `02-project-spec.md` — read that first; it settles
decisions that shouldn't be reopened.

The owner is a designer, not a backend engineer. Explain infrastructure in
plain language and give exact click-by-click steps for anything in the
Supabase / Vercel / GitHub dashboards.

## Hard constraint: $0/month

Every architecture choice defers to this. No paid tiers, no metered bills.
Hence Supabase free (not Cloudflare R2 — R2 wants a credit card), Playwright in
GitHub Actions (public repos get free runner minutes, replacing a $17/mo
screenshot API), Gemini free tier, Vercel Hobby.

Gemini over Groq because tagging needs to *look at* the screenshot — two of the
four facets (block/pattern, aesthetic) are visual judgments a text-only model
can't make.

## Conventions

- Plain JavaScript, no TypeScript. Next.js App Router.
- No UI library. All styles hand-written in `app/globals.css`.
- UI-only React components go in `app/_ui/`. The underscore keeps that folder
  out of Next's routing.
- **All database access goes through API routes** using `supabaseAdmin()` and
  the service-role key. No client-side Supabase anywhere; the anon key is
  unused.
- Route handlers return `{ error: "message" }` with a status code; the client
  puts that string in an error state and renders it.
- `needs_review` is set true by AI enrichment and cleared by any manual PATCH
  edit — unless the caller passes `needs_review` explicitly (that's how the
  review queue's "Mark reviewed" works without touching other fields).
- SQL migrations are `supabase/schema*.sql`, applied **by hand** in the
  Supabase SQL editor, in filename order. There's no migration runner. Keep
  them idempotent (`if not exists`, `on conflict do nothing`).
- Commits: imperative subject, body explaining *why*, `Co-Authored-By` trailer.

## Secrets

Repo is public. Never commit secrets. Three places: `.env.local` (gitignored),
Vercel env vars (the app), GitHub Actions secrets (the capture workflow).
Names only: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_REPO`, `GITHUB_DISPATCH_TOKEN`,
`CALLBACK_SECRET`, `GEMINI_API_KEY`, plus `CALLBACK_URL` on the Actions side.

## Gotchas you would not guess from the code

**`capture.js` is off limits.** Validated in M0 against four hard cases; every
technique in it exists because a specific site broke without it (realistic UA —
Ramp served a text-only page to `HeadlessChrome`; scroll-through for lazy
loading; zeroed animations; consent-banner hiding; 20,000px clip guard). Known
consequence left unfixed: a mobile retry without device emulation overwrites
the same file instead of keeping the taller result, which the spec wants — the
fix would mean editing `capture.js`.

**The Storage bucket is `Captures`, capital C.** Supabase bucket names are
case-sensitive. Every upload failed silently until this was matched.

**Next.js `after()` does not reliably run on this Vercel deployment.**
Enrichment registered with `after()` simply never executed — captures landed,
tags never appeared, no error anywhere. It's now `await`ed inside the
capture-callback route, adding a few seconds to a GitHub Actions job nobody
waits on. Do not "optimize" this back into a background task.

**`export const dynamic = "force-dynamic"` does nothing in a `"use client"`
page.** Those pages still prerendered, so redeploys weren't visible without a
hard refresh. Fixed with `Cache-Control: no-store` in `next.config.js`.

**Modals must go through `ModalShell`,** which portals them to `<body>`. A
`transform`, `filter` or `backdrop-filter` on any ancestor makes it the
containing block for `position: fixed`; a card has two of those plus
`overflow: hidden`, so a modal opened from one rendered 64px wide inside it.
Don't hand-roll `.modal-backdrop`.

**`overflow: auto` + `max-height` around a very tall screenshot corrupts it.**
Full-page captures run 5,000–20,000px, and inside a clipped scroll container
the browser rasterizes them at visibly degraded quality (washed-out, moiré-like
text) even at exact 1:1. The stored files are fine; it's the render path. So
`.detail-capture` and `.crop-container` have no scroll clipping — the page
scrolls instead. Don't reintroduce a scroll box around a full-page capture.

**Use `max-width: 100%`, never `width: 100%`, on capture images.** A 390px
mobile screenshot stretched to a ~900px column is obviously blurry; desktop
captures hide the bug by only ever shrinking. Same reason `.detail-capture` is
capped at `min(1442px, 100%)` (1440 capture + two borders) and its mobile
variant at `min(392px, 100%)` — the detail page is full-bleed.

**All colour comes from `:root` custom properties**; dark mode is the single
`:root[data-theme="dark"]` override block, so never add a raw hex. `--invert-*`
is the solid-dark-button pair, which flips to a solid *light* button in dark
mode. Two deliberate literal-colour exceptions: the chip-strip fade masks
(`#000` there is alpha) and the crop rectangle and handles, which sit on a
screenshot rather than on the app's surfaces.

**`<html>` needs `suppressHydrationWarning`.** `lib/theme.js`'s boot script
stamps `data-theme` before React hydrates, so the attribute is legitimately
absent from the server HTML; without the suppression every page logs a
hydration mismatch. It has to stay inline in `<head>` or the light palette
paints first and the theme arrives as a flash.

**Gemini model is `gemini-3.6-flash`.** `gemini-2.0-flash` is retired and 404s.
The `generateContent` request/response shape is unchanged.

**RLS is intentionally OFF until M6.** Enabling it before auth exists blocks
every read and write — no policies, no logged-in user. The SQL editor warns on
every migration; choose "Run without RLS". Turn it on in the same pass as auth.

**`taggable` and `collection_item` are polymorphic and `target_id` has no
foreign key**, so deleting a site or component cascades to neither — delete
both explicitly (see the site DELETE route). Captures, discovered pages, and a
collection's own items *do* cascade.

**Favoriting must not clear `needs_review`.** Both PATCH routes clear the flag
on any manual edit, but `is_favorite` is excluded: starring something you
haven't read yet shouldn't quietly empty the review queue.

**Utility classes are written doubled** — `.icon-btn.icon-btn`,
`.link-btn.link-btn` — to reach (0,2,0) and beat container rules like
`.detail-actions button`, which are (0,1,1) and style bare elements. Without
it an icon button inherits 14px of padding into a fixed 32px border-box and its
icon collapses to a 4px sliver. Don't "simplify" them to one class.

**Discovered pages are curated, not exhaustive.** Enrichment asks Gemini to
*select* the pages standing for a site's distinct templates rather than
classify all thirty nav links, flagging them `page.is_representative`. Nothing
is deleted — the rest sit behind "Show all", and nothing flagged means "show
everything" so a failed enrichment can't make discovery look empty.

**Brand icons come from Google's favicon service first**, then the declared
`<link rel="icon">`, then `/favicon.ico`. This reverses an earlier decision to
avoid third-party icon services: a company art-directs the mark that represents
it in Google results, so it's the version designed for exactly this size, and
it always arrives as PNG rather than ICO. The trade is that rendering a badge
tells Google which domains are in the library. Google answers 404 when it has
no icon, so status is the whole test.

**Whether an icon fills its badge or is inset is measured, not guessed** —
`lib/iconShape.js` counts opaque pixels and compares to 0.70. The number that
matters is pi/4 (0.785, a circle inscribed in its square): a disc-shaped mark
lands just under it, a square tile at 1.0, a floating glyph far below. Corner
sampling can't tell a disc from a glyph and got Ramp wrong.
`/api/sites/backfill-favicons?force=1` re-resolves and re-measures every row.

**The AI's tag vocabulary is read live from the database** (approved tags
only), never hardcoded — so renaming, merging or deleting a tag immediately
changes what the AI may pick next time.

**AI-proposed tags start `is_approved = false`; manually typed tags are
approved immediately.** A human typing a tag in is itself the review. This is
what stops vocabulary drift (`minimal` / `minimalist` / `clean minimal`).

**Capture timeline groups by exact `captured_at`.** The callback sets one
timestamp per run so desktop and mobile land on the same point. Anything that
writes captures must preserve that.

**Component crops are non-destructive.** `source_image_url` is the original
capture, `image_url` the cropped derivative, `crop_rect` the region.
Re-cropping reads the original, so cropped-out content stays recoverable.

## Local environment

- `git push` is blocked by the sandbox on this machine. Commit normally, then
  push via **GitHub Desktop → Repository → Push**.
- Claude.app needs **Full Disk Access** (macOS System Settings → Privacy &
  Security) to read this folder. Without it every file operation returns
  "Operation not permitted".
- Node came from `nvm`; shell profile is `~/.zshrc`.
