# Specimen — working notes

A personal design-inspiration library for a UI/product designer. Replaces a
Raindrop workflow: paste a URL, get an auto-captured screenshot plus
AI-assigned tags and a summary, then find it later in under five seconds.
Full requirements live in `02-project-spec.md` — read that first; it captures
decisions that were already argued through and shouldn't be reopened.

The owner is a designer, not a backend engineer. Explain infrastructure in
plain language and give exact click-by-click steps for anything in the
Supabase / Vercel / GitHub dashboards.

## Hard constraint: $0/month

Every architecture choice defers to this. No paid tiers, no metered bills.
That's why: Supabase free (not Cloudflare R2 — R2 wants a credit card),
Playwright in GitHub Actions (public repos get free runner minutes, replacing
a $17/mo screenshot API), Gemini free tier, Vercel Hobby.

Gemini over Groq specifically because tagging needs to *look at* the
screenshot — two of the four tag facets (block/pattern, aesthetic) are visual
judgments that text-only models can't make.

## Conventions

- Plain JavaScript, no TypeScript. Next.js App Router.
- No UI library. All styles hand-written in `app/globals.css`.
- UI-only React components go in `app/_ui/`. The underscore keeps that folder
  out of Next's routing.
- **All database access goes through API routes** using `supabaseAdmin()` and
  the service-role key. There is no client-side Supabase usage anywhere, and
  the anon key isn't used at all.
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

Repo is public. Never commit secrets. They live in three places:
`.env.local` (local, gitignored), Vercel env vars (the app), and GitHub Actions
secrets (the capture workflow). Names only: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_REPO`, `GITHUB_DISPATCH_TOKEN`,
`CALLBACK_SECRET`, `GEMINI_API_KEY`, plus `CALLBACK_URL` on the Actions side.

## Gotchas you would not guess from the code

**`capture.js` is off limits.** It was validated in M0 against four hard cases
and every technique in it exists because a specific site broke without it
(realistic UA — Ramp served a text-only page to `HeadlessChrome`; scroll-through
for lazy loading; zeroed animations; consent-banner hiding; 20,000px clip guard).
Known consequence we deliberately did *not* fix: when a mobile capture retries
without device emulation, it overwrites the same file instead of keeping the
taller result. The spec says production should keep the taller one. Doing that
requires editing `capture.js`, which is forbidden, so it stands as-is.

**The Storage bucket is `Captures`, capital C.** Supabase bucket names are
case-sensitive. Every upload failed silently until this was matched.

**Next.js `after()` does not reliably run on this Vercel deployment.**
Enrichment was registered with `after()` and simply never executed — captures
landed, tags never appeared, no error anywhere. Enrichment is now `await`ed
inside the capture-callback route. It adds a few seconds to a GitHub Actions
job nobody waits on. Do not "optimize" this back into a background task.

**`export const dynamic = "force-dynamic"` does nothing in a `"use client"`
page.** Those pages were still statically prerendered, so redeploys weren't
visible without a hard refresh or an incognito window. Fixed with explicit
`Cache-Control: no-store` headers in `next.config.js`. Don't remove them.

**`overflow: auto` + `max-height` around a very tall screenshot corrupts it.**
Full-page captures run 5,000–20,000px. Inside a clipped scroll container the
browser rasterizes them at visibly degraded quality — washed-out, moiré-like
text — reproducible even at exact 1:1 pixel scale with no scaling involved.
The stored files are pixel-perfect; it's purely a render-path problem. Both
`.detail-capture` and `.crop-container` therefore have no scroll clipping; the
page itself scrolls. Don't reintroduce a scroll box around a full-page capture.

**Use `max-width: 100%`, never `width: 100%`, on capture images.** A 390px-wide
mobile screenshot stretched to the ~900px detail column looks obviously blurry.
Desktop captures hide the bug because they only ever shrink.

**Gemini model is `gemini-3.6-flash`.** `gemini-2.0-flash` is retired and 404s.
The `generateContent` request/response shape is unchanged.

**RLS is intentionally OFF until M6.** The spec is explicit: enabling it before
auth exists blocks every read and write, since there are no policies and no
logged-in user. The Supabase SQL editor warns on every migration — choose
"Run without RLS". Turn it on in the same pass as auth, and test each policy.

**`taggable` is polymorphic and `target_id` has no foreign key**, so deleting a
site or component does *not* cascade to its tag links. Delete them explicitly
(see the site DELETE route). Captures and discovered pages *do* cascade.

**The AI's tag vocabulary is read live from the database** (approved tags only),
never hardcoded. So renaming, merging, or deleting a tag in the tag-management
screen immediately changes what the AI is allowed to pick next time.

**AI-proposed tags start `is_approved = false`; manually typed tags are
approved immediately.** That asymmetry is deliberate — a human typing a tag in
is itself the review. This is the mechanism that stops vocabulary drift
(`minimal` / `minimalist` / `clean minimal`).

**Capture timeline groups by exact `captured_at`.** The callback sets one
timestamp for the whole run so desktop and mobile land on the same timeline
point. Anything that writes captures must preserve that.

**Component crops are non-destructive.** `source_image_url` is the original
full-page capture, `image_url` is the cropped derivative, `crop_rect` is the
region. Re-cropping always reads the original, so cropped-out content is
always recoverable.

## Local environment

- `git push` is blocked by the sandbox on this machine. Commit normally, then
  push via **GitHub Desktop → Repository → Push**.
- Claude.app needs **Full Disk Access** (macOS System Settings → Privacy &
  Security) to read this folder. Without it every file operation returns
  "Operation not permitted".
- Node came from `nvm`; shell profile is `~/.zshrc`.
