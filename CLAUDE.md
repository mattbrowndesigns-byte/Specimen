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

**RLS is on, but it is not what separates accounts.** Every route still uses
`supabaseAdmin()` and the service-role key, which bypasses RLS by design — so
the isolation comes from route code filtering each query on the signed-in
user's id. RLS is the second lock: it stops the anon key, now exposed to the
browser for auth, being pointed at the REST API directly. Both layers matter
and neither is enough alone. A new table needs a `user_id`, `enable row level
security`, and every query in its routes scoped — miss the scope and the data
leaks even with RLS on.

**Ownership checks read the row scoped to the user** (`lib/ownership.js`)
rather than reading it and comparing after. Someone else's row then comes back
as "not found", which is also what the caller should be told — leaking the
difference between "doesn't exist" and "isn't yours" lets anyone enumerate the
library by id.

**Enrichment resolves the owner from the record, not from a session.** The
capture callback runs with no session at all (GitHub Actions authenticates with
`CALLBACK_SECRET`), so `runEnrichment` reads `site.user_id` itself. A
vocabulary from the wrong account would quietly tag one library with another's
words.

**Signup goes through `/api/auth/redeem`, never Supabase's own signup.** The
invite code is checked and consumed there, and the account is created with the
admin API. Supabase's signup endpoint knows nothing about codes, so leaving it
reachable would bypass the gate entirely. Email confirmation is off and auth is
email + password: Supabase's built-in mailer sends 2 messages an hour and only
to pre-authorised addresses, so magic links can't work until custom SMTP is
configured.

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

**Two oranges, and greys darker than they look.** `--accent` is the brand tone
for marks — the notification dot, the AI sparkle. `--accent-solid` is the one
that carries white text, and it's darker because the brand tone under white is
3.74:1, which fails AA for a button label; dark mode solves it the other way,
keeping the bright orange and darkening the label to 5.49:1. `--text-muted` and
`--text-faint` were also raised (from #6b6b70/#9a9aa0): faint text was 2.8:1 on
white, which is decoration with words in it, not readable text. Both now clear
4.5:1 on the page and on a card. What still fails, deliberately: `--border-strong`
is 1.4:1 against a surface where WCAG 1.4.11 wants 3:1 for control boundaries —
fixing it would mean visibly darker borders on every control in the app.

**The specimen is drawn off the live site, by the browser, for free.**
`analyze.js` renders "Aa" to a canvas in the page being analysed -- which has
the licensed font loaded -- crops to the ink and stores a white-on-transparent
PNG in the font row. The app shows it as a CSS *mask* tinted with `--text`, not
as an image: white artwork would be invisible in light mode. This replaced
loading Google Fonts to fake a specimen, which could only ever be right for the
faces that were already free. No model is involved, so it costs nothing per
site. A face the canvas can't draw falls back to naming the family and then to
a generic of the right species.

**Typefaces are reported by role, not by share.** Headline / Body & UI /
Accent, computed in `analyze.js` from display ink against body ink. "87% of the
text" only ever restated "this is the body face".

**Hidden sites are out of the grid but still in search.** `site.is_hidden` is
filtered in `fetchSitesList`'s default path only. A hide with no way back would
be a trap, since the grid is the only route to a site's page — searching is the
way back. Like favouriting, hiding does not clear `needs_review`.

**A discovered page is named after its own URL.** Link text is written to
persuade -- "Our mission and team" -- and a nav link built from two spans comes
back as one run-on string with no space in it. `/about-us` is About Us on every
site there has ever been. `page.utility_label` from enrichment is the fallback
for a path that says nothing (`/p/9f2c`), and the raw link text is last.

**Pages are ranked by prominence, not classified by template.** `page.tier` is
primary / secondary / tertiary. Asking what *kind* of page it was put an FAQ
index and one FAQ entry side by side as equals, and five product pages that are
one template shown five times.

**`block_pattern` is an inventory; the other facets are descriptions.** It
takes up to 8 tags where the rest take 2, and enrichment is asked to work down
the screenshot naming every distinct section. Nav, hero and footer are on every
site ever made, so tagging them by name makes the tag useless for search --
they're recorded only as a variety ("Mega Footer", "Type-Led Hero") or not at
all.

**Card tags are measured, not counted.** `TagRow` renders every chip once,
reads their widths back, then keeps the number that fits on one line with room
for "+N more". A count per card size can't do it — "Ecommerce" is twice the
width of "SaaS" and the grid reflows at every breakpoint. It re-fits on every
render *and* on a ResizeObserver: the size switch changes widths through a
re-render, and a browser that isn't painting (a hidden tab) delivers no
observer callbacks at all, which is also why this can't be verified through a
hidden preview pane.

**Colour names are generated, not looked up.** A table of the 148 CSS colour
names sounds right until an off-white comes back as "Linen". `lib/colorNames.js`
describes the colour instead — lightness, then chroma, then hue — so #f7f4f1 is
"Warm off-white" and #211006 is "Muted brown". Brown and navy are the two
hand-written exceptions, because "dark muted orange" is not what anyone says.

**Each analysis keeps the one it replaced.** `style_history` on `site` holds up
to twelve prior readings, newest first, pushed by the analyze callback. A
library of design work is the right place to notice a redesign, and that's only
possible if the previous reading survives the next one.

**`analyze.js` exists because `capture.js` is off limits.** Reading a site's
palette and typefaces needs a rendered DOM, which means Playwright, which means
the Actions runner — but not an edit to the validated capture script. So it's a
second script and a second page load in the same job, plus its own
`analyze-dispatch.yml` so a site can be re-read without a new capture. It runs
*after* delivery in `capture-dispatch.yml`, with `continue-on-error`, so a
failed style read can never cost the screenshots.

**Colours are measured, not parsed.** A stylesheet declares thousands of rules
the page never paints, and frequency in CSS says nothing about area on screen.
`analyze.js` walks the rendered DOM and weights each colour by the area it
actually covers — backgrounds less what their children paint over, borders as
perimeter x width, text as *ink* (about 14% of the em square per character, or
one paragraph would outweigh a hero panel), SVG fills by bbox. `<img>`,
`<video>` and `url()` backgrounds are skipped, which is the point: a palette
taken from pixels reports the photography, not the interface. Gradients are
kept — they're drawn UI — with the element's area split across their stops.

**A site that declares no background still has one.** Stripe sets neither
`html` nor `body` background and lets the browser canvas show through; without
the synthetic canvas entry in `analyze.js`, the colour covering 70% of the page
was missing from its palette entirely. Body wins over html, white is the
fallback.

**The palette bar compresses widths and stores true shares.** Painted area is
brutally top-heavy — a page background routinely holds 80% — so a literal bar
is one white rectangle and five slivers. `SiteStyle.js` raises each share to
0.55 for width only; the real percentage is on every swatch.

**Font and foundry links are checked before they're stored.** Gemini names the
typeface, its foundry and the nearest Google/Adobe equivalents; every URL it
returns is then fetched, and anything that doesn't answer is dropped rather
than rendered. Both font services return a real 404 for a name they don't
have, which is what makes this work — and what lets the model suggest freely.
A font that *is* on a service gets a link to itself there rather than a
substitute, including the self-hosted Google fonts half the web serves.

**`palette` and `fonts` are jsonb on `site`, not tables.** They're always read
with the site and never queried across rows, so a join buys nothing — and
columns inherit the site's own RLS instead of needing a policy, a `user_id`
and a scoped query in every route, which is the part that's easy to get wrong.

**A rate-limited enrichment is queued, not lost.** Gemini's free tier is one
pool shared by every account on the deployment, so two people saving at once
can trip the per-minute limit. `runEnrichment` tells a retryable failure (429,
5xx — flagged on the error by `lib/ai.js`) from a permanent one, and queues the
first with an exponential backoff. `enrich-queue.yml` drains three at a time
every fifteen minutes; three, because the queue exists precisely because too
many requests arrived at once. GitHub disables scheduled workflows on a repo
idle for 60 days — if tags stop filling in on their own, check it's still
enabled.

**Every Actions-facing route must be in `middleware.js`'s `PUBLIC_PATHS`.** The
runner has no session, so a callback left off that list is redirected to
/login and the job's results are thrown away with no error anywhere.

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
