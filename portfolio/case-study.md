# Kivli

**A design library that reads the sites you save.**

Paste a URL. It photographs the page, measures the colours it actually paints,
identifies the typefaces from their letterforms, and files it against a
vocabulary I already design in.

| | |
|---|---|
| **Role** | Solo: research, product, interface design, and the code |
| **Running cost** | $0 a month, permanently |
| **Status** | In daily use |
| **Built with** | Next.js, Supabase, Playwright, Gemini |
| **Live** | https://specimen-gamma-six.vercel.app/case-study |
| **Try it** | https://specimen-gamma-six.vercel.app/share/QZNxODnUGm24y2kwUr8t81qFdNo0f6CO |
| **Source** | https://github.com/mattbrowndesigns-byte/Specimen |

---

## The problem was my own filing

I had about a hundred sites saved in Raindrop and I could not find any of them.

Not because the tool was bad. Because saving a link takes two seconds and
filing it properly takes two minutes, so I never did the second part. Six
months of that and I had a folder called "inspiration" with ninety items in it,
each one a title and a favicon, and no way to answer the only question I ever
actually asked: *what was that site with the stat strip that scrolled
sideways?*

Every tool I tried had the same shape. They all assumed the person saving would
also do the describing. Nobody does the describing.

> So the filing has to happen without me. The whole interaction is one paste.

## The constraint that shaped everything

I gave myself a hard rule: this costs nothing to run, forever. No trials, no
free tiers that expire, no card on file anywhere.

That one rule made most of the architectural decisions for me, and it made them
better than a budget would have. Screenshots run on free CI minutes instead of
a $17 a month screenshot API. The AI runs on a free tier that allows twenty
requests a day per model, which turned out to be the most interesting design
problem in the project. A limit that tight forces you to be honest with people
about what is and is not happening.

| Daily AI budget | Cost of one saved site | Screenshots |
|---|---|---|
| **60** requests, across three models | **2** (tags, then typefaces) | **Free**, unlimited CI minutes |

## The vocabulary had to be the one I already think in

The first version let the AI pick its own words and produced exactly what you
would expect: *minimal*, *minimalist* and *clean minimal* all describing the
same page. So the vocabulary became a closed, faceted list: what the site is
for, what kind of page it is, what blocks are on it, and how it looks.

The block list took two tries. Version one had Hero, Footer, Accordion, CTA
Band. Every site ever made has a hero and a footer, so a tag naming only the
family matches everything and finds nothing. I had written "never tag it as
just hero" into the instructions from the very beginning and it never once
worked.

It took me far too long to see why. The instruction said one thing and the menu
it was choosing from said another.

> The instruction was arguing with the menu, and the menu won.

Every value is family then variety now, and the families are the ones from the
design system I work in every day. The words that come back are the words I
would have searched for.

| Before | After |
|---|---|
| ~~Hero~~ | Hero Carousel |
| ~~Logo Wall~~ | Logo Strip |
| ~~Bento Grid~~ | Card Bento |

## Colours are measured, not parsed

The obvious way to get a site's palette is to read its stylesheet. It does not
work. A stylesheet declares thousands of rules the page never paints, and how
often a colour appears in CSS says nothing about how much of the screen it
covers.

So Kivli opens the page in a real browser and weights every colour by the area
it actually covers. Backgrounds minus whatever their children paint over them.
Borders as perimeter times width. Text as **ink**, roughly 14% of the em square
per character, because otherwise one paragraph outweighs an entire hero panel.
Photographs are skipped on purpose: a palette taken from pixels reports the
model's jumper in the hero shot, not the interface.

Then the measurement broke on its own terms. One site's teal sat on a single
newsletter button. By area it was invisible. By chroma it was the most
deliberate colour on the page.

| Share of painted area | Chroma |
|---|---|
| **0.0157%** against a 0.2% floor | **213**, next colour down: 45 |

> Area is the wrong question to ask about an accent.

A call to action is deliberately small and deliberately the most saturated
thing on the page. So two colours can be readmitted from under the floor, but
only when they are painted on something clickable **and** highly saturated.
Both halves matter: without the first test it readmits every stray tint,
without the second it readmits every dark grey button. That same site's dark
grey search button is correctly still left out.

## The panel was right and my intuition was wrong

Kivli reports typefaces by role: headline, body and UI, accent. On one site I
was certain it had made a mistake. The company has a typeface named after
itself, and the panel had filed that face as chrome rather than as the
interface face.

It was right.

| The face named after the company | The face actually carrying the page |
|---|---|
| **1,119** characters, almost all footer legal | **3,259** characters of body copy |

**A face's role comes from where it is set, and the footer counts.** I keep
this one in the notes because it is the clearest case of the measurement
knowing more than I did, and it is worth remembering before "fixing" a result
that looks surprising.

## Two progress bars, not one percentage

A hundred imported bookmarks is two hundred AI requests against a tier that
allows sixty a day. "How long until this is done" has no honest answer.

But it has two answers. Screenshots cost free CI minutes and finish in hours.
Tags cost the scarce thing and finish over days. One bar averaging those is
wrong about both.

> All your screenshots are in. Tagging resumes at 12:05 AM.

Keeping them apart is what lets the panel say that instead of saying *61%*. The
import bar also does not pulse, unlike the capture bar it otherwise copies. The
capture bar animates because it describes a minute you are watching. This one
describes three days you are not, and a stripe sliding under a still fill would
be claiming activity it cannot vouch for.

## A unit that lies about what it measures

I set the reading measure on the written pages to `74ch`, which reads in the
source like a 74 character line. A `ch` is the width of the digit zero, one of
the widest glyphs in a proportional face.

| What the source says | What it actually fitted |
|---|---|
| **74** characters, apparently | **102** characters of real prose |

The measure is `34em` now, about 75 characters, arrived at by setting a long
paragraph and dividing its width by the width of 100 characters of actual text.
Measured, not calculated. It is the small version of the lesson the whole
project kept teaching me.

## What I deliberately did not build

**Drag and drop folders.** A folder here is a tag, so one item can sit in two of
them and the AI can file it on save. Real folders force a choice the library
does not need to make, and drag and drop buys only re-tagging, which is already
one click.

**Sharing a single resource.** A resource *is* a URL. Sharing one is sending
that URL. A share page wrapping one link is a redirect with branding on it.

**A flat tag input.** It is a nicer interaction and it loses the faceting, which
is the most important structural decision in the product.

## What I would change

The tag vocabulary needs a periodic merge pass and the app does not prompt for
one, so two family-only tags from an early version are still live and still
matching everything. The merge tool exists. The reminder to use it does not.

---

## Notes for reusing this

The canonical version of this case study is the page at `app/case-study/page.js`
in the repo, which renders at `/case-study` using the product's own design
tokens. This file is the same content in a portable form: paste it into a
portfolio site, a PDF, or a Notion page.

If you edit one, edit the other. They are deliberately kept in sync.
