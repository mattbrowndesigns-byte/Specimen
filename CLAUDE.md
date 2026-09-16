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

**`body` is a flex column, so a short page still puts its footer at the
bottom.** `.page` takes `flex: 1 0 auto`. This is safe alongside `ModalShell`
only because `.modal-backdrop` is `position: fixed` — a fixed element is out of
flow and never becomes a flex item, so a portalled modal can't end up as a
sibling column.

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

**The wordmark's hover is a colour wave, not a gradient, and that's the
second attempt.** It was a gradient with `background-clip: text` on the `<h1>`,
which cannot coexist with moving the dots. That clip is generated from every
glyph in the element's subtree and ignores what those descendants do to
themselves, so the h1 kept painting a full unclipped "i" — dot included —
behind the split copies: the moving dot rose off a static one that couldn't be
removed. (An earlier round had the opposite failure, the letters vanishing
entirely, because a moved or clipped child stops receiving the parent's
text-clipped background and inherited `transparent`.) One span per letter with
a staggered colour animation has no clip to fight over, reads as the same
sweep, and lets each part animate independently.

**Only the dot moves, and 18.45% is measured.** Each `i` is drawn twice and
each copy clipped — stem below the cut, dot above it — because a dot can't be
addressed separately from the stem it sits on. Lalezar's `i` has ink from
0.6825em above the baseline down to it, with the dot/stem gap centred 0.1625em
below the top of that ink; against a 1em line box whose baseline sits at
0.7045em, the cut lands at 0.1845em from the top of the span. It's all
relative, so the size can change freely — but a different wordmark face has to
be measured again. The duplicate carries `aria-hidden`, so the accessible name
is still "Kivli" and not "Kiivlii".

**An empty Wayback response is not an answer.** archive.org's availability
endpoint returns a snapshot for one timestamp and nothing for another on the
same URL, with captures plainly in the CDX index either side of both —
829studios.com reported "No Wayback snapshot" against months of them. The route
asks again without a timestamp before believing an empty result.

**Nothing may pick a random value in a `useState` initialiser.** `FeatureRotator`
did, so the server rendered one line and the browser another, and every page
carrying a rotator threw a hydration error and re-rendered that subtree from
scratch. Randomise in an effect after mount.

**Two behaviours, split by content type, not by page.** The shell *scales* —
utility bar, footer, dashboard, collections, favourites, a site's own page —
because a grid of things gets more useful with more room. Running prose is
*capped*, because its limit is the reading eye and not the window. There is no
`--grid-max`: nothing caps the shell any more. `--prose-max: 1080px` caps the
written pages and nothing else reads it.

**The 12-column grid is for page structure; the card mosaic is not on it.**
`--grid-columns: 12`, `--grid-gutter: 20px`, `--grid-margin: 24px`. At 1440 the
twelve tracks come to 97.67, so a 4-span is 450.67px and an 8-span 921.33 — a
span of n is n tracks plus the n-1 gutters inside it, which is why 4 + 8 comes
to 1392 and not 1372. The detail page is 8 + 4 (9 + 3 above 1900px, or a third
of a large monitor goes to a sidebar that has no use for it) and the written
pages are 4 + 8.

**The mosaic is sized by its smallest card, and that is the second answer.**
Spans were the first — large 4 of 12, medium 3, small 2 — and they read well at
exactly one width. A span turns a wider window into *wider cards*: a large card
is 824px on a 2560 monitor, three of them. Twelve columns can only divide into
3, 4, 6 or 12 across; there is no 5, 7 or 9. So `.grid` is
`repeat(auto-fill, minmax(min(var(--card-min), 100%), 1fr))` and each size class
sets one number (`--card-min-large: 380px`, medium 290, small 190), chosen to
reproduce 3/4/6 across at 1440 exactly. A large card then holds 397–504px from
1280 to 3840 while going 3, 4, 5, 6, 7, 8, 9 across. The mosaic keeps the
page's gutter and margins, so its outer edges still land where the bar and
footer do — the alignment that was ever worth having. Card edges agreeing with
master columns bought nothing, because nothing else on the dashboard is
column-aligned to them. The `min()` is load-bearing: without it a container
narrower than the card minimum overflows instead of dropping to one column.

**The margin is wider than the gutter, and the step comes out of the gutter.**
Equal at 24/24 the grid read as though the cards continued past the edge of the
page rather than sitting inside it. 28/20 fixed the relationship and was the
one pairing that divides 1440 into a whole track, but 28px was visibly too much
air at the edges — 24 is the margin this app wants, so the gutter carries the
difference and the track is fractional. Not worth chasing: the track is
fractional at every width below the ceiling regardless. Below 700px both drop
to 20/16, since on a phone content width is worth more than air at the edges.
Change either number and re-check the spans — the whole system derives from
them, which is why the feature cards kept landing on columns 5 and 9 through
both of these changes without being touched.

**The chrome bands are padded by `--grid-margin` and nothing else.** That one
declaration on `.utility-bar-inner`, `.site-footer-inner` and
`.shared-bar-inner` is what puts the wordmark, the content and the footer mark
on one line at every width. Two wrong versions came before it: hardcoded 24px,
which drifted the moment the margin was not also 24; then a `--grid-max`
ceiling with `margin: 0 auto`, which was correct only while `.page` was also
capped — the day the shell went fluid it centred the bar on a large monitor and
left the logo floating in from the corner. Anything new that spans the window
takes the padding and no ceiling.

**`.page-wide` is a no-op.** `.page` has no ceiling left to break out of. The
class stays because the markup uses it and because a page that wants to opt out
of something one day has somewhere to say so.

**The prose pages have their own type scale, built from a 20px body.** 20/30
body, 24 for h3, 32 for h2, a clamp to 52 for h1, 18 for the aside note, 16 in
a feature card. The old 15px body was why the copy never reached the right of
its column: a reasonable line length in a small size is a narrow ribbon in a
wide one. It's scoped to `.prose-page` and doesn't touch the library's own UI
sizes.

**`ch` does not measure characters, and trusting it cost 28 of them.** A `ch`
is the advance of the digit zero, one of the widest glyphs in a proportional
face, so `.prose-section p { max-width: 74ch }` resolved to 921px and fitted
**102** characters of real prose — while reading in the source like a
74-character measure. Measured, not calculated: set a long paragraph, divide
its width by width-of-100-characters-of-actual-text. The measure is now `34em`,
about 75, and `--prose-max: 1080px` sizes the 8-span copy column to 681px so it
lands in the same place without the paragraph having to hold itself back. Use
`em` for a measure; only use `ch` if the face is monospaced.

**The written pages are capped and centred, and flush left was tried first.**
Keeping them flush left preserved the title's alignment with the wordmark, and
it reads as a page that failed to load: at 1860 the canvas ends at 1080 and the
right third is void. Splitting that slack is what makes it look chosen — 390px
each side at 1860, 740 at 2560. It survives centring better than most documents
do because the section headings live in the aside column, so the canvas has a
real left edge to read instead of text floating in the middle. The cost is that
the title no longer lines up with the logo *above* 1080; below it, centring is
a no-op and the alignment is exact, so every laptop and phone is unaffected.
`.prose-page` just inherits `.page`'s `margin: 0 auto` now.

**The two columns are aligned by cap top, and the numbers are measured.** A
heading's line box starts about 7px above its capitals at 32px, so aligning
boxes leaves the eye seeing two different starts. The FAQ's first question
needed 17px removing (a row's top padding plus the list's top border, which is
why the list has no top rule); a feature card's grid needs pushing *down* 7px
so the card's edge meets the cap line. Verified at 0.02px, 0.28px and 1.02px
out on FAQ, features and about. Change a heading size and these want
re-measuring.

**`--brand-ink` is the wordmark's colour, and it isn't `--text`.** A very dark
purple, picked to land on the same contrast as the black it replaced — 16.25:1
against the page where #1a1a1a was 16.26 — so only the cast changed. It carries
the wordmark in the bar, the footer and the login card, plus the dashboard
headline. Dark mode flips it to a near-white with the same trace of purple.
The capture bar's `--ramp-*` stops run deep purple to lit orange, and the deep
stop is lighter in dark mode or it vanishes into the groove it sits in.

**The feature list lives in `lib/features.js`, and two surfaces read it.** The
rotator picks a `short` line while a capture runs; `/features` lays the whole
set out with the longer `blurb`. Adding a feature in one place adds it to both,
which is the only way those two don't drift apart.

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

**Area is the wrong question to ask about an accent, so one is rescued from
under the floor.** A call to action is deliberately small and deliberately the
most saturated thing on the page, and those two properties are linked --
weighting purely by painted area throws away the one colour the designer
actually chose. x-energy.com's teal is `#00d5cf` on a single newsletter
button: 0.0157% of painted area against a `MIN_SHARE` of 0.2%, sixteen times
under, while being the only colour on the site with real chroma (213 against
45 for the next). So `analyze.js` readmits up to two colours from under the
floor when they are painted on something clickable *and* have chroma >= 60.
Both halves are load-bearing: without the control test this readmits every
stray tint, and without the chroma test it readmits every dark grey button --
x-energy's own `#1a3847` search button is the case that proves the second,
and it is correctly left out. Their real shares are stored unchanged and the
role is `accent`, so the bar still reads dominant to minimal with the accent
at the minimal end.

**The palette bar compresses widths and stores true shares.** Painted area is
brutally top-heavy — a page background routinely holds 80% — so a literal bar
is one white rectangle and five slivers. `SiteStyle.js` raises each share to
0.55 for width only; the real percentage is on every swatch.

**`document.fonts.check()` is not an availability test, and treating it as one
was a silent lie in two places.** It answers "would this text render", and text
always renders — in a fallback — so
`document.fonts.check('64px "ThisDoesNotExist"')` is **true**. It returns false
only for a face the page *declared* and hasn't loaded, which means the answer
also flips with the weight you ask about: squareup.com declares Square Sans
Text at weights it never loads, so asking at 400 said no and 700 said yes. It
was guarding both the specimen and the ink attribution, so a face nobody
rendered could be named, measured and drawn from the runner's default serif.
`isAvailable()` in `analyze.js` now tests whether naming the family changes
what gets drawn, against all three generics — one is not enough, because a
face can coincidentally match one generic's advance widths but not all three.
Weight-free on purpose: Cash Sans ships no 700, and a synthesised bold is
still Cash Sans.

**The naming pass sees the letterforms, because the name lies.** `identifyFonts`
used to get a CSS string and nothing else, so it answered the way the string
reads: Square's "Exact Block" came back "heavy geometric display", matched to
Syne — a sans. It is a transitional serif whose own fallback stack is Georgia
and Times New Roman. `analyze.js` now draws a second specimen for the model,
black on white with more glyphs than "Aa", passed as `specimen_probes` keyed by
family and deliberately *not* on the font rows so a throwaway image can't reach
the database. With the image the same call returns "transitional serif" and
Lora / Freight Text. It costs nothing — the page is already open and already
has the font.

**Matches may be loose but must never cross species.** A serif answered with a
sans sends someone to look at something that could never stand in, which is
worse than nothing; but an empty slot where a designer wanted a starting point
is its own failure. So the prompt ranks those two rules explicitly: stay in the
species and temperament, then reach for the nearest relative rather than
returning null, and say in the note how near it is.

**A face's role is measured from where it is set, and the footer counts.**
squareup.com looks like Square Sans Text should be the UI face — it is the one
named after the company. It isn't: Cash Sans carries the 16px body copy
(3,259 characters of it in the content area) while Square Sans Text VF is
almost entirely the footer, 1,119 characters of legal and nav chrome. Exact
Block is display only, 24px and up. The panel's Headline / Body & UI / Accent
was right and the intuition was wrong, which is worth remembering before
"fixing" a role that looks surprising.

**Font and foundry links are checked before they're stored.** Gemini names the
typeface, its foundry and the nearest Google/Adobe equivalents; every URL it
returns is then fetched, and anything that doesn't answer is dropped rather
than rendered. Both font services return a real 404 for a name they don't
have, which is what makes this work — and what lets the model suggest freely.
A font that *is* on a service gets a link to itself there rather than a
substitute, including the self-hosted Google fonts half the web serves.

**The analyze callback stores the measurement before it names anything.**
Colours, roles and specimens are measured in a real browser and cost nothing
to keep; names, foundries and Google/Adobe matches depend on a model and on
other people's uptime. squareup.com is why the order matters: three custom
faces, so every match check missed, the route ran past its 60s limit, and a
perfect reading of the palette died with the request — the step showed green
in Actions because `continue-on-error` reports a failed step as success. So
there are two writes, and the naming pass also has a `DESCRIBE_BUDGET_MS`
ceiling. The worst case is now a panel with real colours and unnamed faces.

That ceiling started at 35s, which was *inside* the work rather than outside
it. Timed against x-energy.com: the identify call alone, with two specimen
images attached, is 22.9s, and `describeFonts` then spends up to 8 more on a
foundry and two font services — ~31s on a good run, so anything slower came
back with colours and unnamed faces, which is exactly what x-energy did. It is
45s now. Note what is still unsolved: `callGemini` retries at 2s, 4s and 8s, so
a naming pass that hits a 503 can still miss its window, and unlike enrichment
there is no queue to catch it — the names simply wait for the next re-read. If
this recurs, the fix is to give naming its own request and its own 60s rather
than sharing one with the measurement write.

**`firstResolving` checks its candidates in parallel, and that is the fix, not
a tidy-up.** Sequentially it cost the *sum* of its misses — three Adobe slugs
at 4s each, twice over for a face with no match, ~24s per font — which is what
put that request over the limit in the first place. Preference order is still
honoured; only the waiting is shared.

**A font card says "no close match" only where the check actually ran.**
`described` means the Google and Adobe lookups happened for that face, and
nothing else — so it is absent on a row the write-first callback stored and
never named, on a face the model declined to name, and on the rows handed back
when the identify call fails. None of those were checked, and a card that
claimed otherwise would be inventing a result. Rows written before the flag
existed are recognised by `provider`, the one field that pass has always
added, and become precise on their next re-read.

**A finished reading arrives in two writes, so the client waits for both.**
Stopping the poll on `analyzed_at` was right when there was one write; after
the write-first fix it meant three checked font matches sat in the database
until the next reload, and the panel looked like a face with no match rather
than one still being looked up. `SiteStyle` now keeps polling while any face
is unnamed, bounded by `NAMING_GRACE_MS`, and the card says it is checking
rather than showing an empty slot.

**Both style panels keep their heading and their shape when empty.** The
placeholders reuse `.palette-bar`, `.font-card` and `.font-sample` and only
fill them, so a card is 82px and the bar 46px whether or not there's a reading
— nothing moves when one lands. They pulse only while a run is in flight, and
an *analyzed* site with nothing to show gets words instead, because a finished
reading that found nothing is an answer and not a pending state.

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

**A shared library arrived with no components, and nothing said why.**
`component` has never had `favicon_url` / `favicon_fills` -- a component's icon
is derived from its `source_url` when it renders -- so selecting them in the
public read errored, and the read destructured `data` alone and returned `[]`.
An empty array is indistinguishable from an empty library, so the share went
out silently missing a whole tab. Every read in that route now goes through
`checked()`, which logs the failure. Destructuring `data` without `error` from
a Supabase query is the bug pattern: it turns "your query is wrong" into
"you have nothing", which is a sentence the UI will happily render.

**Measure the ink, not the box, before "fixing" the wordmark's alignment.**
The shared bar looked like its mark sat low against the button, and the box
centres said 34.29 against 29.00 -- a convincing 5.3px. That number is
worthless: the border box is 44px because Lalezar declares a descender "Kivli"
never uses, which is the whole reason the trim margins exist. The *glyph*
centre, computed from the measured baseline at 0.7045em and ink top at
0.6825em, was 28.27 against the button's 28.00. It was already centred to
0.27px, and correcting the phantom 5.3px would have pushed a correct lockup
visibly high. The real defect was the bar being 2px shorter than the
dashboard's, because `.shared-cta-btn` took `--control-h` (32px) while the Add
button it mirrors is 34 -- both bands pad 12px around their tallest child, so
the button's height *is* the bar's height.

**`RecordGrid` tabs only when it's holding more than one kind.** A collection
of six websites has nothing to separate and a one-tab strip is furniture; a
mixed one answers the question someone opening a shared collection actually
has. The resource tab renders rows, not cards, for the same reason the
dashboard's does -- a resource has no picture and a card built around a missing
one is mostly empty rectangle. Favourites gets this for free, which is correct:
it's the same mixed grid.

**The shared page has its own footer, and must.** `SiteFooter` lists
Favorites, Collections, Manage Tags and Review Queue -- four links that all
bounce a stranger off the login screen. `SharedFooter` carries only the three
pages that explain what they're looking at. Same rule as the utility bar:
nothing in the app's chrome applies to someone without an account, so don't
reach for it.

**Nothing in a shared page's chrome may assume brand knowledge.** "Get Kivli"
means nothing to someone who has never heard the word; the button says
"Create Your Own" and the panel's is "Create Your Library". The "N items,
shared with you" line is gone too: the tabs carry their own counts, and a
reader who followed a share link does not need telling that it was shared
with them.

**A share has a scope, and each scope is its own row with its own token.**
`kind` is now library / sites / components / resources / collection / folder.
Sharing used to be all-or-nothing, which with three tabs is an over-answer:
sending someone your component crops is no reason to hand over 150 saved
websites. Separate rows are what make the links independently revocable —
killing the components link must leave the library link working — and
`share_one_per_target_idx` already keyed on (user_id, kind, target) so it
needed no change. `folder` points at one `resource_type` tag, and the share
route checks that facet explicitly: without it a link could point at an
aesthetic and render an empty page.

**Sharing a single resource was asked for and deliberately not built.** A
resource *is* a URL. "Sharing" one is sending that URL, which is what the row's
title already is — a share page wrapping one link would be a redirect with
branding on it. Folders and the whole tab are the units that mean something.

**The owner's name lives in `auth.users.raw_user_meta_data`, not in a table.**
It is one string read in two places (the share payload and the account menu),
and a table would need a user_id, RLS, a policy and a scoped query everywhere
it was touched. `displayNameFor()` falls back to the capitalised local part of
the email, which matters more than it looks: every account that predates the
field has no name, and a page reading "'s inspiration library" is worse than
the generic title it replaced. The name is resolved from the auth record on
every public read rather than copied onto the share row, so renaming yourself
renames every link you have already sent.

**`Wordmark` is a component because the one page strangers see was the one page
the mark sat dead on.** The animation was keyed `.utility-bar
a.utility-bar-title:hover`, and the shared page had a plain `<h1>Kivli</h1>`
beside it — same font, no letter spans, nothing to animate, and 30px against
the bar's 44px. The letters now come from `app/_ui/Wordmark.js` and the hover
is keyed on `.wordmark-link`, which the utility bar, the shared bar and the
login card all carry. Anything else that shows the mark takes that class and
sets only `font-size`; the em-based descender trim is the same everywhere
(`margin-bottom: -0.307em`) and was triplicated before.

**The shared page tabs on contents, not on scope.** A library share from an
account with no components shouldn't offer an empty Components tab — the scope
says what was shared, the array lengths say what is worth showing, and with one
non-empty kind there is no tab strip at all. The collection read also grew
components and resources: it used to select sites only, so anything else
bookmarked into a collection silently vanished from the shared view.

**`.shared-invite-mark` is doubled for the same reason `.icon-btn` is.**
`.shared-invite p` is (0,1,1) and styles bare elements, so a single class on a
`<p>` lost to it and the wordmark rendered at the body's 16px instead of 34.

**A share link's token is the whole of its authorisation.** `/api/shared/
[token]` takes no session and scopes every query by the row that token
resolves to, never by anything else in the request — so a caller can ask for a
token but cannot ask for a user's sites. Revoking is a delete of that row, so
there's no half-working state left behind, and a revoked link answers
identically to one that never existed. The public payload is deliberately
narrower than the owner's: no notes, no review flags, no hidden saves.

**`/api/share` and `/api/shared` are different paths on purpose.**
`PUBLIC_PATHS` matches by prefix, so naming the public read `/api/share/...`
would have made managing your own links public too. Anything added near these
needs the same care.

**Every Actions-facing route must be in `middleware.js`'s `PUBLIC_PATHS`.** The
runner has no session, so a callback left off that list is redirected to
/login and the job's results are thrown away with no error anywhere.

**Component crops are non-destructive.** `source_image_url` is the original
capture, `image_url` the cropped derivative, `crop_rect` the region.
Re-cropping reads the original, so cropped-out content stays recoverable.

**Every control in the results bar is `--control-h`, and they were a pixel or
two apart before that.** The size switch is a padded container around 26px
buttons, the view switch a padded container around 13px text, the sort button a
bordered box with its own padding — three independent recipes that happened to
land near 30px and read as a wobble rather than a row. They now set
`height: var(--control-h)` with `box-sizing: border-box` and let their insides
fill it. Measured at 32.00 / 32.00 / 32.00. Anything new that joins that row
takes the token rather than a padding pair.

**`.chip-filter` throws away `.chip`'s font size, and that is why a row's tags
came out at body size.** `.chip` sets 11px; `.chip-filter` resets the button
with `font: inherit`, and the shorthand clears `font-size` along with
everything else. The dashboard's strip never noticed because
`.chip-strip .chip-filter` re-declares 13px — deliberately bigger, since a
filter is a target. Any other place a chip is also a button has to say its size
out loud: `.resource-tags .chip-filter` is 11px, matching a card's chips
exactly (both 19px tall, measured).

**A `resource_type` proposal is only accepted when nothing in the list fitted.**
Asked to pick up to two types and optionally propose one, the model does both:
lawsofux.com came back tagged "Reading" — correct — plus a proposed
"reference", which is the same idea in different words and lands in the review
queue as an amber chip nobody can interpret. `block_pattern` can afford
proposals because it takes eight and is an inventory; `resource_type` answers
"what kind of thing is this", so if that already has an answer there is no gap
for a new word. Enforced in `enrichResource.js` (`tagIdsToLink.length === 0`)
*and* asked for in the prompt — the code is the guarantee, the prompt just
saves a round trip. Proposed labels are also Title Cased there, because the
model returns lowercase and the vocabulary is not.

**The resource progress bar is driven by its own request, not by a clock.**
`CaptureProgress` races a 75-second Actions job and polls for the result;
a resource has nothing to poll — the row already exists and the only
outstanding work is one text call. So `ResourceProgress` takes `done` as a
prop, estimates 8 seconds, ticks every 250ms, and wears
`.capture-status-quick` to cut the fill's 1s width transition down to 0.25s.
A Regenerate from the edit modal passes no label and so shows no bar: it has
its own button state, and a progress panel at the top of the page for a thing
you did in a modal is a jump scare.

**Resources are a third library, and the point of them is leaving Raindrop.**
A resource is a link saved for what it *does* -- an icon set, a stock library,
an AI tool -- not for how it looks. Everything else in this app assumes a
record has a screenshot worth studying; these have none, which is why they are
their own table (`resource`), their own tab, and rows rather than cards. The
feature exists because a tool that replaces 70% of a workflow replaces none of
it: without somewhere to put the non-visual saves, the owner keeps a second
bookmarking app and keeps saving to it out of habit. Deliberately absent from
the table: capture, page, palette, fonts, style_history, is_hidden.

**`resource_type` is a fifth facet and nothing else may touch it.** The other
four describe how a page is *designed*; "Mega Footer" and "Brutalist" say
nothing about Lucide. Sharing a vocabulary across the two libraries put words
in the dashboard's chip strip that no website could ever match. `/api/tags`
returns all five, so the dashboard splits the list and hands each tab only its
own -- `designTags` to Websites and Components, `resourceTags` to Resources.
`FilterModal` iterates a hardcoded `FACETS`, so the fifth stays out of the
website filters by not being listed there. Add a sixth facet and both of those
places need revisiting.

**The folder strip is a rendering of that facet, not a second organisation
system.** Folders were asked for, and tags are what got built: a folder here IS
a `resource_type` tag, so one resource can sit in two, the AI fills them in on
save (which is the whole premise -- hand-sorting is too slow to actually do),
and "Unsorted" is free because it means "no type tag yet". Real folders would
force a choice the library doesn't need to make, and drag-and-drop -- the
expensive part, with pointer events, touch and keyboard to get right -- buys
only re-tagging, which is one click on a chip. Collections stay the
hand-curated, cross-cutting thing and now accept resources too.

**A resource saves in two steps so the row is instant.** POST creates it from
one `fetchResourceMeta` fetch (title, favicon) and returns; the client then
calls `/api/resources/[id]/enrich`, which is text-only -- no screenshot, no
`imageToBase64`, no vision call. That second call is also the Regenerate button
in the edit modal, which is why enrichment re-fetches the page itself rather
than having the POST hand its HTML over. A rate-limited run queues on the
`resource` row and `enrich-queue.yml` drains it, in its own batch of three
beside the sites' -- a text call costs seconds against a site's forty, so
making them compete would let cheap work starve expensive work for nothing.

**Anything polymorphic needs the new `target_type`, and anything reading one
needs the new branch.** `taggable` and `collection_item` each took one more
value in `schema_m13.sql`; the expensive half was every *reader*. The
collection detail page resolved `target_type === "site" ? sites : components`,
so a resource fell into the else-branch, missed, and vanished from the
collection without an error. Favourites, the notification bell, the review
count and `RecordGrid` all needed the same treatment. Grep for
`target_type` before adding a fourth kind.

**A resource never gets the "No image" placeholder.** That placeholder means a
capture hasn't landed yet, which on a record that will never have one is a
permanent apology for a screenshot nobody asked for. In a card grid
(favourites, a collection) a resource gets `.resource-cover` -- its brand mark
on a plain field, still 16/9 so the grid keeps its rhythm. In the review queue
its row passes `hideThumb` and gets no frame at all. `ReviewRow` reads `name`
while a resource stores `title`, so the queue aliases it at the call site.

**`78em` is the `ch` trap wearing a different hat.** `.resource-summary` shipped
its first draft at `max-width: 78em`, which reads like a measure and resolves to
1014px -- **174 characters** at 13px. It only looked survivable because most
summaries wrapped before reaching it. Measured, not calculated: 38em is 494px
and 84.7 characters, with a 2-line clamp so a verbose model can't make one row
four lines tall. An `em` measure is about 2.2 characters per em in this face at
any size; multiply, don't eyeball.

**The invitation panel is the ramp at rest, held to 46%.** Everywhere else
that gradient means "something is happening"; on the stranger's page it means
"this is the thing that made all of it", and the panel that asks someone to
sign up should be the most saturated thing in view. Painted at full strength it
would be unreadable in one place: the sweep runs through `--ramp-lit` (#ff9153),
which carries neither white text at 2.2:1 nor the page's own ink, so a literal
gradient panel gets a stripe down the middle where the copy stops working.
Laid over `--invite-ground` at 46% opacity the lightest stop measures 6.97:1
against white and 5.50:1 against the body tone -- 6.49 and 5.11 in dark mode,
where the ramp's stops lift. The panel is dark in **both** themes, which is why
it carries `--invite-text` / `--invite-text-muted` rather than `--invert-*`:
those flip with the theme, and the solid button here has to be the light one
either way.

**Doubling a class only wins the declarations you actually restate.**
`.shared-invite-mark.shared-invite-mark` was doubled to beat `.shared-invite p`
and did -- on font-size, colour, margin, every property it named. It said
nothing about `max-width`, so the paragraph rule's `34em` still applied, and
with `margin: 0` rather than `0 auto` that 1,156px box sat hard left while its
text centred inside it. The mark looked like it had a centring bug; it had an
inheritance one. When you double a class to escape a (0,1,1) rule, read what
else that rule sets.

**A resource row is one stretched link, not a clickable div.** The whole row
opens the site -- a resource has no detail page and nothing else a click could
mean, and reaching back to ~47px of title text to act on a 727px row was work
the row was asking for and not repaying. It is done with an `::after` on the
existing anchor (`.stretch-link`), so the `<a>` stays the real link:
middle-click, right-click, "open in new tab", focus order and the accessible
name are all untouched and only the hit area grows, measured 47x19 to 727x115.
The pseudo is a child of the anchor, so hovering anywhere in the row underlines
the title. Anything that must stay clickable inside -- the tag chips, the edit
and save controls -- takes `position: relative; z-index: 1` to sit over the
overlay. The cost is that the summary can no longer be mouse-selected; that is
the trade every list of links makes, and a generated blurb is not text anyone
copies.

**Clear is an action, so it stopped looking like a tag.** As a bordered pill in
the filter strip it read as one more word from the vocabulary and the eye ran
straight past it. It keeps the strip's padding and font size -- which is what
holds its baseline on the chips' line, measured identical -- and gives up
everything that made it a chip: no fill, no pill, underlined, with a hairline
after it separating the action from the vocabulary. It also drops the pill's
left inset, because a chip's *edge* belongs on the page margin and a word's
first letter does. The divider is `--border-strong`, not `--border-soft`:
#e6e6e9 on the #f7f7f8 page ground is 4% darker than what it sits on, which is
a line nobody can see rather than a delineation.

**Every count in the app wears the same pill.** The filter strip's
`.chip-count`, the shared page's `.tab-count` and now `.folder-count` -- a
number with nothing around it floats beside its label instead of belonging to
it. Inverted holders get `rgba(var(--invert-text-rgb), 0.22)`, which is the
one recipe that works on both a light and a dark holder.

**One kind, one icon, and `app/_ui/kinds.js` is the only place that says so.**
A Website is a globe in the Add menu, on the dashboard's tabs, in a shared
collection's tab strip and on the page a stranger lands on -- which stays true
only because all four read the same list, the same way the rotator and
`/features` both read `lib/features.js`. It carries three ids per kind because
three things had already named them differently and renaming them would touch
far more than it buys: `id` is the database's word and what RecordGrid keys on,
`tab` is the dashboard's state, `add` is what the save routes take.

**`--field-bg` exists because this is the one fill that has to run in opposite
directions.** A search field reads as a well against a white page and as a
raised shape against a dark one, and neither existing token survives both:
`--chip-bg` is 240 against a 247 page in light (1.03, a smudge) and
`--surface-sunken` is 13 against an 18 page in dark (1.04, near enough
invisible). The two values are picked to land on the same perceived step from
the page either way -- 1.10 light, 1.21 dark, measured. The search field and
the active tab share it, because they are the same idea: a filled holding
shape.

**The search circle is `--brand-ink`, and that is a hierarchy decision.** Add
is the action this app exists for; search is what you do between saves. Two
solid oranges in one screenful would have had them arguing over which one you
came to press, so the circle takes the wordmark's own deep purple -- still the
brand, clearly the quieter of the two, and not a disabled grey. It pairs with
`--surface` for the glyph, which inverts with it: dark circle and white mark in
light, light circle and dark mark in dark, 17.4:1 and 14.1:1. In dark mode a
filled control has no choice but to go light, which is the same flip every
solid button in the app already makes.

**The circle focuses the field; it does not submit.** Every search here filters
as you type, so a button that "ran" the search would be claiming work that had
already happened. What it does is label the field and give it a target you can
hit without aiming. It also means hiding `::-webkit-search-cancel-button`,
which WebKit draws in exactly that spot -- two controls stacked on each other
is worse than losing the native one.

**Tabs are filled pills, not an underline.** An underline marks a position in a
sequence -- "page two of this" -- and these aren't a sequence; they're three
separate libraries you switch between, so a filled shape saying "the one you're
in is held" is what's actually true. Hover darkens the label and leaves the
fill alone: a hover fill one shade off the active one is two states wearing the
same clothes. The count pill inside an active tab dropped from `--invert-bg` to
`--surface` at the same time, because the near-black holder it needed against
bare page reads as a blot inside a grey pill.

**The field, the Filters button and the circle are sized by arithmetic.** The
field and the button are both 44px; the circle is 36 with 4px around it, so it
centres without a translate that has to be re-derived every time the field's
height changes. Measured 44.00 / 44.00, and 4/4/4 on the circle.

**Search suggestions come from the library's own words, and that is the whole
design.** A site with millions of records can suggest "carousel" because
somebody's carousel is certainly in there. A personal library of 150 saves
cannot -- a suggestion that returns nothing is worse than no suggestion,
because it reads as a promise. So `SearchField`'s corpus is the tag vocabulary
first, ranked by `usage_count`, then the names of the things themselves. That
ranking is also what makes the empty-field list mean something: "popular" here
is the tags with the most saves against them, which answers "what is this
library mostly about" on the way past. The Resources tab adds domains, because
half of what a resource is remembered by is where it lives -- you look for
"figma", not for the title of the page.

**Recent searches live in `localStorage`, not in a table.** A search history is
a per-device convenience, and a table for it would want a `user_id`, RLS, a
policy and a scoped query in every route that touched it -- for a list nobody
would miss if a browser lost it. The key derives from the tab's existing view
key (`.view.` -> `.recent.`) rather than being a prop every caller has to
remember. Reads and writes are both wrapped: a blocked localStorage means no
history, not a broken search.

**Two bugs that a dropdown attached to an input will always have.** First:
choosing a row refocuses the input, focus is what opens the panel, so the panel
reopens on the row you just picked from -- `skipOpen` is a ref that swallows
exactly one focus event and clears on the next tick. Second, and worse because
it only shows up in one browser: Safari blurs the field on mousedown *without*
focusing the button, so a blur-closes-the-panel handler unmounts the row before
its own click can fire. Every button inside the field carries
`onMouseDown={(e) => e.preventDefault()}` for that reason. Neither is
theoretical; both were in the first draft.

**The search field has three states and the fill carries two of them.** At rest
it's filled and flat; hover empties the fill to `--surface` and draws a light
ring; focus keeps that and doubles the ring. Going *pale* on hover rather than
darker is the counterintuitive half and the right one -- a resting fill says
"there is something here" and clearing it says "it's yours now". The ring is a
tint of `--brand-ink`, matching the circle, and its strength is not a taste
judgment: 0.5 over the focused surface measures 3.35:1 in light and 4.52:1 in
dark, which is the floor WCAG puts under a focus indicator. Anything lighter
photographs better and stops being an indicator. It replaced a solid `--text`
ring at 17.4:1, which was an indicator and a sledgehammer. Hover has no floor
to clear, so it sits at 0.22 and is genuinely faint.

**No combobox/listbox roles on the suggestion panel.** Doing that pattern
properly needs `aria-activedescendant` pointing at options that may not contain
interactive children -- and a recent row contains a delete button. What the
panel actually is, is a search box with a set of labelled buttons under it:
reachable, correctly announced, and not claiming a richer pattern it would only
implement 80% of. Arrow keys move a highlight that is the same index the mouse
sets, so there is never a row that looks chosen and a different row that is.

**The search's result line echoes the term, because live filtering has no
moment.** There is no submit here, so "8 sites" quietly becomes a different
number while you are still looking at the box you typed into, and the grid
changes without anything saying why -- searching for "Minimal" and getting 8
when the Minimal *tag* says 12 is the case that makes it confusing rather than
merely quiet. `ResultCount` puts the term next to the count as a chip you can
lift back off, so the affordance lands where the eye already went to check the
number. It deliberately stays in the field as well: the field is where it is
still editable, and "minimal" wanting to become "minimalist" should be four
keystrokes rather than a delete and a retype.

**A dropdown's highlight is inset from the panel, not full-bleed.** A band that
runs wall to wall reads as a *section* of the panel; a rounded shape sitting
inside it reads as one item in a list, which is what you are pointing at. The
panel's own 8px padding is the inset, so the row's text still lands where it
did.

**Clear gave up the pill, so it had to give up the pill's hover.** The fill was
coming back through the one state nobody restyled -- `.chip-filter:hover:not
(.chip-selected)` ties with `.chip-clear.chip-clear` on specificity and sits
further down the file, so it won on order. The exception now lives beside the
rule it is an exception to, which is the only place it can win without a third
class. Grey ink to near-black, no fill: what an underlined word does.

**The cross-tab nudge is a pointer, not a merged result list.** Searching,
finding nothing, and concluding you never saved it is the worst failure this
app has -- it breaks the only promise it makes -- and the likeliest cause is
that the thing is one tab over. So an empty result asks `/api/search-counts`
and offers "3 resources match ->", which switches tab and carries the query.
What it is *not* is one blended list: the three tabs are three ways of looking
(screenshots you scan, crops you compare, rows you read), so a single list has
to pick one shape and two thirds of the results arrive in the wrong one. It
also only appears at zero -- with results on screen you are not lost, and a
line under every search saying where else you could have looked is wallpaper
inside a week.

**The counts have to agree with the tab they point at, so sites reuse the
RPC.** `search_sites` covers a full-text vector plus tag labels plus
discovered-page labels; no `ilike` over columns would reproduce that, and a
nudge promising 3 that lands on 0 is worse than no nudge. Components and
resources filter in the browser, so the route mirrors their predicate:
the text columns via one `or`, then tag labels through `taggable`, then a
single **scoped** read over the union -- ids reached through `taggable` carry
no `user_id` of their own, so they are checked against the table rather than
trusted because the tag they hang off belongs to the right person. A search
string also gets double-quoted before it goes into an `or` filter, which is
comma and parenthesis delimited and would otherwise read a query containing
either as syntax.

**"Nothing here yet" and "nothing matches" are different answers, and the
difference is whether you asked a question.** LibraryBrowser keyed them on
`items.length` instead, which was correct for components and wrong for sites:
sites search on the *server*, so `items` IS the result, and a search that found
nothing rendered "Start your library. Paste any URL" -- the one message
guaranteed to be wrong, since you were looking for something you knew was in
there. It keys on a `searching` flag now (a query or a tag filter), not on how
many rows came back.

**A handoff between tabs lives in the parent, because the receiving tab hasn't
mounted.** The dashboard renders one tab at a time, so "search resources for
this instead" has nowhere to put the query except `page.js`. It's cleared the
moment the receiving tab takes it -- otherwise coming back to that tab a week
later re-runs a search you have long moved on from.

**Folders and the controls that act on them share one line.** Stacked, the
view switch and sort button sat on the count's row -- which is a caption, not a
control bar -- and put two bands of chrome between the search box and the first
result. The strip takes the room and fades at whichever edge still has folders
past it; the controls are pushed right by `margin-left: auto` rather than by
the strip's `flex: 1`, so they stay right in the one case the strip isn't
rendered at all, a library whose resources are none of them filed yet. A folder
also took `--control-h` at the same time: three recipes landing near the same
number is the wobble that token exists to stop, and a strip sitting 3px proud
of the controls beside it is that fault in a new place. Measured 32.00 across
all four.

**`useEdgeFade` is a hook because two strips do this now**, and the classes are
`.strip-fade-left` / `.strip-fade-right` rather than named after the chip strip
that first needed them. Its `watch` argument is what changes a strip's
*contents* without changing its box -- adding a folder to a strip that was
already full changes `scrollWidth` and nothing else, so the ResizeObserver
never fires. Each caller passes a fixed-length list of numbers, which is what
React needs.

**A search that found nothing gets the grey panel, not a grey sentence.** One
line of type floating where the grid had been reads as a page that failed
rather than as an answer, and it gave the cross-tab nudge nowhere to sit that
looked deliberate. `NoMatches` reuses `.empty-state` a size down
(`.empty-state-search`: no min-height, smaller headline) because this is a dead
end you back out of in a second, not the first thing a new account ever sees.
The headline names the term, since by the time you have read "nothing matches"
your eye has left the search box and the word is the thing you are about to
doubt.

## Local environment

- `git push` is blocked by the sandbox on this machine. Commit normally, then
  push via **GitHub Desktop → Repository → Push**.
- Claude.app needs **Full Disk Access** (macOS System Settings → Privacy &
  Security) to read this folder. Without it every file operation returns
  "Operation not permitted".
- Node came from `nvm`; shell profile is `~/.zshrc`.
