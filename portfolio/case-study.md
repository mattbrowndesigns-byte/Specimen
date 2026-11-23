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
| **Try it** | https://specimen-gamma-six.vercel.app/demo |
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

## Images are a library of their own

Half of what I save from a studio's site is not the site. It is the work on it: the identity system on a bus shelter, the packaging, the poster series. Saving the page as a website photographed the case study's layout and lost the pictures I actually came for.

So images became a fourth library. Paste a project page and Kivli pulls every image off it, guesses which ones are the work with a free heuristic, then spends one AI request sorting and describing the lot. A picker shows its choices and I make the final call; anything left out is deleted from storage, so a page only ever costs space for what I chose.

> A logo and that logo on a bus are two findings.

That is why each image is its own card on a board rather than one card per project. Grouping still happens, on the image's own page, where the rest of the project sits underneath it. The project's paragraph is written once and shown there, instead of being copied onto every image it came with.

The vocabulary is three facets. Industry and aesthetic are shared with websites, because Brutalist means the same thing on a billboard as on a homepage. Medium is its own: poster, packaging, signage, identity system. Words a designer would search for, from a closed list, for the same reason the block vocabulary is one.

| Requests to sort and describe a page | Facets on every image |
|---|---|
| **1**, however many images it has | **3**, medium, industry, aesthetic |

Two guards came from running it for real. A title is two to six words by instruction, and one came back as hundreds of words of looping filler, so anything past eight words is treated as that and replaced. And files are named by their content and cached for a year, because the free plan's limit on what a board of images can serve is the first one a library like this would hit.

Two things it could not hold at first. A screenshot on my desktop had no page to paste, and case studies loop MP4s that a still frame records badly. Uploads go from the browser straight into storage on a signed link, because Vercel refuses a request over 4.5 MB and a retina screenshot of a long page is often bigger; the server only reads the file back to make the WebP. A batch of uploads is described in one request, like a page.

Videos are kept as muted loops of up to 15 MB each, because the free plan's 1 GB holds every capture and every image too. On Jade Kuzak's Gemini page, three of the six loops were over that, and the picker says so rather than letting the page look as if it had none.

> The server has no video decoder. Every browser is one.

The board lays everything out by a still, and the AI can only look at one. Focus Lab's pages hand over a poster with every video; Cargo sites like Jade Kuzak's hand over none. Decoding video on the server would mean a large binary on a free function, so for a video with no poster the picker plays the stored file in the browser, draws a frame a second in, and sends that back as the poster.

| Largest video kept | Largest request Vercel accepts |
|---|---|
| **15 MB**, of a 1 GB free plan | **4.5 MB**, so uploads go straight to storage |

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

## The interface kept saying things that were not true

Switch from Resources back to Websites and, for half a second, a library of 44
saves said "Start your library" and "0 sites". Each tab loads fresh when you
open it, its list starts empty, and an empty list was being drawn as an empty
library.

Half a second sounds harmless. On the demo, in front of someone deciding
whether to keep reading, it looks like a product that has just lost everything.

> Nothing on screen yet is a different answer from nothing there.

Each tab now waits for a real response before it says anything about what you
have. Until then it shows a skeleton built from the real cards and rows, so
nothing moves when they arrive, and a failed request stays loading rather than
describing a library it never read.

The filters had a quieter version of the same fault. Two columns put each count
at the far edge, so Landing's 31 sat nearer Homepage's checkbox than its own
word, and the list offered tags with nothing filed under them, each one a
promise of results that did not exist. They are pills now, each holding its own
count, and a tag is not offered until something carries it.

## Two redesigns, used side by side

Once the product worked I wanted it to look like it did. Rather than redesign
in place, I built two alternatives next to the version that shipped: Elevated,
an ambitious exploration, and Refined, a quieter one. All three ran on the same
data, and I switched between them while actually using the app, not while
looking at screenshots.

Refined won, and then it took four things from Elevated that only showed their
worth in use: capsule buttons, a shaded side panel on a site's page, the
viewer's controls on one row, and a search bar that stays put while you scroll.
A second pass took Elevated's near-black palette and its type hierarchy. The
borderless cards, the heavier shadows and the tabbed inspector stayed behind.

My favourite detail came from a bug. Elevated forgot to exclude the remove
button on a tag from a rule that turned every button into a pill, so each tag
got an accidentally generous ×. It was the easiest target in the panel. Refined
has it on purpose.

The original is kept, reachable, for exactly this page. The new design is a
layer that applies only where a page is marked for it, and the original is the
absence of that mark, so no new rule can reach it. Then I checked rather than
trusted.

| Pages fingerprinted | Differences in the original |
|---|---|
| **4**, every element's style and box, hashed | **0**, before, during and after the redesign |

The original design: https://specimen-gamma-six.vercel.app/demo-original
The exploration it borrowed from: https://specimen-gamma-six.vercel.app/demo-elevated

## The portfolio link is the real app

The first public demo was the share page, a read-only grid of screenshots. It
showed the library and none of the product. What makes Kivli read as software
is the search, the filters, the view switches and a site's own page, and
rebuilding all of that read-only would have meant a second copy of the app that
slowly stops matching the first.

So the demo link hands a visitor a signed pass that the server reads as a demo
account, and one rule at the door refuses every change it tries to make.

| Routes that can change data | Rules guarding them |
|---|---|
| **39**, saving, tagging, sharing, deleting | **1**, at the door, not one per route |

It is deliberately not a real login. A real session handed to strangers could
be pointed at the database directly, around the app. A pass only this server
can check leaves nothing to go around.

Saving is the one thing a demo has to show and the one thing it cannot do for
real, because every save spends my own twenty-a-day AI budget. So Add is
staged: the address is locked to ramp.com, the field says so, and a twelve
second bar plays before the card lands. Every screenshot and tag it reveals is
real output from a real save.

> Staged and saying so reads as a designed demo. Staged and hiding it reads as
> a trick.

First-time visitors get a seven-stop tour that ends by opening Add, and their
visits are counted under their own path, so I can tell a stranger from myself.

## Handing the library to someone else's AI

A product designer friend put it simply: the research happens in Kivli, and
then the work happens in an AI chat, and nothing carries one into the other.
Gathering a project's references into a collection was only half useful if
they stayed there.

So every save and every collection has a Copy for AI button. It produces a
plain Markdown file, which every model reads, and a download beside it for
dropping the same file into a project folder. I did not build "Open in
ChatGPT". Those links carry the whole text in the address, which a collection
outgrows, and they pick the reader's model for them.

The interesting part was what to say at the top. Not a product pitch, and not a
prompt, because the reader brings their own question. What a model actually
needs is how far to trust each part: the colours and type were measured in a
real browser, the tags and summary were written by a model, and the notes are
mine.

> A model that knows which lines were measured weighs a note above a guess. One
> that doesn't treats them as equals.

| AI requests per copy | A six-item research collection |
|---|---|
| **0**, rendered from what is already known | **3,885** words, dated, with what they share up top |

Every file says when it was made, and the same thing always downloads under the
same name, so a fresh copy replaces a stale one instead of sitting beside it.
What text cannot do is carry a picture: the screenshots are links, and most
chat apps will not open a link to look. That is the case for the next step, a
connection an AI can search directly and see the images through.

## Letting the AI look for itself

Copying fixed the carrying, and showed what was still missing. The question a
designer asks halfway through a project is rarely "here is my collection". It
is "have I saved a pricing page like this?", and answering that means the AI
has to be able to look.

So Kivli is now an MCP server, the open standard Claude, ChatGPT and most
coding tools use to reach outside data. Connect an AI once and it can search
the library, open a save, read a collection and find things like the one in
front of it.

Images travel with the answer. A site comes back with the top of its
screenshot attached, and the rest of the page is cut into numbered sections the
model asks for one at a time. A full page handed over whole gets squeezed to a
postage stamp, which is the same lesson the tagging learned from Gemini.

"Similar" is not a model's opinion. It ranks by shared tags, which are a
curated vocabulary, then by shared typefaces, and every result says what it
shares. No request is spent, and the answer can be checked.

Signing in is Supabase's job. Its OAuth server issues and refreshes the
tokens, and Kivli's part is one consent page that says what the app will and
won't be able to do. Disconnecting it signs the app out on its very next call,
which I tested rather than assumed.

> The library stopped being somewhere you go, and became something your tools
> can ask.

| Tools an AI can call | Added to the monthly bill |
|---|---|
| **11**, seven that read and four that add | **$0**, on the same free tiers as everything else |

Reading came first, and writing was the obvious other half. The research
happens in the chat. After twenty minutes comparing typefaces with an AI, the
two you settle on should not need copying out by hand. So a connected AI can
now save websites and resources, make a collection and file things into it, all
from one sentence: "add these three sites to a new collection for the Acme
project".

It adds and nothing else. No tool deletes, edits or retags, so a misread
request leaves something to tidy up rather than something to recover. A save
from a chat runs the same code as one from the Add box. I moved that code out
of the app's routes so there would only be one copy of it. Ask for more than
three sites at once and the rest join the import queue, because the free AI
tier allows about ten saves a day. A tool that ignored that would be promising
tags it could not deliver.

The first font I saved this way came back titled "Google Fonts". The page calls
itself "Inter - Google Fonts", and the title cleanup keeps the site's half of
that. The AI already knows which font it was asked to save, so the tool now
takes a title from it.

The demo library still has its own address with no sign-in, so anyone can
point their own AI at it and try. It stays read-only because the four tools
that write are only given to a signed-in owner:
https://specimen-gamma-six.vercel.app/api/mcp/demo

## The details I'm still pushing on

None of these is a story on its own. Together they are most of the difference between a tool that works and one that feels finished, so I keep them written down: what looked wrong, what was actually wrong, and what changed.

**A blurry logo was a rule, not a file.** Intercom's mark looked soft in the header. It wasn't a bad image: Kivli picked a site's icon by whether it loaded, and Google's only Intercom icon is 48 pixels, drawn here at 88 on a sharp screen. Asking for a bigger one changes nothing, because Google quietly sends the size it has. Now every candidate is measured and the first one big enough wins, a site with no large icon anywhere keeps its sharpest, a round mark is scaled to meet its circle, and a site with no icon at all gets its initial on a colour of its own. A script re-asks for every save whenever the rule changes.

**One tooltip, drawn above everything.** Some controls had a styled grey pill and most had the browser's own label, which waits a second and a half and looks different on every screen. The pill could not simply be copied everywhere: on a card it was clipped by the card's rounded edge. It is now one piece that draws on top of the whole page, used by about forty controls.

**Copy and download are one control.** Every save and collection had Copy for AI and, beside it, a bare download icon with nothing holding it. The first fix made them one capsule with two targets inside it, the label copying and an arrow opening a menu, and two things to press in one shape was one too many. It is a single button now, Export for AI, opening a menu with Copy and Download, and no tooltip, because the menu says what each does. The menu is drawn above the whole page, because in the image viewer the panel it sat in cut its left half off.

**A strip that sat off-centre by four pixels.** The tag strip under the search measured 12 pixels above and 8 below on Websites, and 12 above and 18 below on Resources, whose view controls also lived on a different line from every other tab's. The first fix set both to 12 and was still wrong to the eye: I had measured to the strip, which carries 8 pixels of padding under its pills so a scrolling row is never clipped. Measured to the pills, the gap below was 20. It is 12 above and below the pills now, on every tab, and the rule says measure what you can see.

**Descenders lost to an animation.** The rolling line on the home page is clipped to its row so the incoming line can't swing through the one below. The clip cut the tails off every y and p. Measured, those tails end 0.05em past the line box, so the clip now allows 0.08em.

**Filters that could only narrow to nothing.** On the image board, picking Signage and then Editorial returned nothing, because it asked for images tagged both. The convention, and what the other libraries already did, is any of the chosen tags within one group and all of the groups together.

**Labels that changed width.** The selected tab went bold, which made its label wider and nudged every tab after it sideways. They all share one weight now; the fill says which one you are in.

**A finished job that looked unfinished.** The import panel was still showing a batch from weeks earlier, two full bars under a gradient band that read as a third bar. A finished batch now stays for the day it finishes and then goes.

**A drop target that refused the drop.** The Add menu offered Upload Images for a visual, in a pill 32 pixels tall, and a screenshot dragged onto it was not taken. Nothing was closing the menu. The button had never been told to accept a drop: a browser refuses a file anywhere the page doesn't claim it, and only the board behind the menu did, only while that tab was open. It is a box now, 168 pixels tall, that takes the drop and lights up as a file crosses it, and a near miss no longer opens the file in place of the app. The progress moved as well. It sat inside the menu, the one save that kept its menu open, so an upload now closes it and reports in the same panel every other save does. The bar there is the bytes actually sent, and once there is no figure to give it stops giving one.

**Uploading a component.** The first real use of image uploads, for Visuals, raised the next question: a screenshot of one good pricing table is a component, and the only way to save one was to capture a whole page and crop it. An uploaded image now joins the same list a captured page waits on, already ready to crop, so the crop tool, the list and Discard needed no second version. What is different is that cropping is optional. A screenshot is often already just the component, so there is a button to use it as it is, and one to keep a whole batch.

Doing it turned up a gap. Websites, resources and visuals all wait in line when the AI is too busy to describe them. Components never did: one saved on a busy day stayed untitled until I noticed. They share the same line now, uploaded or not.

Still open: Intercom stays slightly soft, because no bigger version of its mark exists anywhere. Case studies' looping videos are confirmed on the live app, and uploading your own images is live too. Importing components and visuals from a bookmarks file, and uploading a component, still have to be proven there.

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
