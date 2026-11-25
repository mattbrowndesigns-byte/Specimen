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
staged: the address is locked to ramp.com, and a twelve second bar plays before
the card lands. Every screenshot and tag it reveals is
real output from a real save.

> The tour says what is staged, once. After that, every word is the app's own.

It used to say so everywhere: a banner, a note under the field, a disclaimer in
the progress bar, a card for a save you had already used. Each was honest, and
together they kept pulling you out of the thing you had come to see.

Visuals were the odd one out: the demo dropped the images straight on the board and skipped the choosing, which is most of what that save is. It opens the real picker now, with the ten images one real read of an Uber case study found. The AI ticked eight and left two thumbnails for other projects alone, and whatever a visitor ticks is what lands.

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

## Letting people change the question

> A tag answers a question. The hard part was letting someone add one without letting them ruin the answers.

The tags page was every word in the library as a full-width row. 158 rows, three buttons each, 9,830 pixels of scrolling, and nothing saying how often a tag was used or which library it was for. Then someone on LinkedIn asked about sorting a library in a way that wasn't there, and the question underneath it was whether the groups should be mine to choose.

The obvious fix was a tab per library. The data said no. Aesthetic is shared, and in my own library 380 of its 490 uses are on visuals, so merging two words under a tab called Websites would have changed three hundred visuals without saying so. The groups are a list on the left now, sorted by where they're used, with one group's tags beside it.

Merging was a dropdown. I wanted to drag one tag onto another, like one folder into another, and that only works if both are on screen, which is why the rows became small tiles. Dragging one tag onto another means merge in Apple Photos and nest in Evernote, so it always asks, says exactly how many saves are involved, and lets you keep either name or type a new one. Selecting does the same thing for a phone or a keyboard.

A merge also stays merged. The AI used to be free to propose the word you had just merged away. It's remembered now, and means the tag you kept. Testing the undo found one that had never worked: it brought the word back without any of the visuals that wore it. Every merge is now undone to a library that matches the one before it, link for link.

A group of your own is a name, a question, the libraries it's for, and who fills it in. The question matters most, because it's what the AI reads. It tags new saves unless you ask it to go back, and going back sends sixteen pictures in one request, forty minutes apart, so a day of it still leaves room to save things. I checked one real batch against the pictures and all sixteen held up. You can hide any group and get it back as it was. And there are five, because every group is another question on every save and another section in every filter. Asking for a sixth shows you the five you have and how much you use them, which is the moment to decide whether one of them earned its place.

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

**Three rows you couldn't choose between.** The list of AI apps with access showed Claude three times, because adding the connector again records a new approval. My first fix added a paragraph explaining that and a time on each row, and two of the three times were the same. Explaining a confusing list is not fixing it. It is one row per app now, with its number of approvals and one Disconnect for all of them, and it stays out of the way until something is connected.

**A features page telling an old story.** The features page still opened with pasting a URL, and filed 37 cards by topic, so components had one and nobody could tell there were four kinds of thing to save. The obvious fix was to group it by kind. I sorted the list first, and 20 of the 37 belonged to no single kind, so they would have been repeated four times or dropped. It leads with the four kinds now, then what each does, then what works across all of them, in 28 cards. One claim had quietly become false on the way: that everything the AI writes waits for review.

The first version of that layout did too much. Headings sat in a sticky column that went empty once you had read them, four jump cards repeated the headings below, and a panel at the end offered to take you back to your library, which the logo already does. It is a heading, a line and the cards now, with a lead of three lines at most.

**A component that moves.** The next thing I tried to upload was a screen recording, because some components are only worth saving for how they move. A clip is kept whole, so there is no crop to offer and the page says so rather than showing a control that does nothing. Its card shows one frame with a play mark; its own page plays the clip, muted and looping.

A .mov is mostly a label. The screen recordings on my Mac are all H.264 inside, which every browser plays, so nothing has to be converted: the file is relabelled as an MP4 without touching the picture. What is inside can also be HEVC or ProRes, which often will not play in Chrome or Firefox, so the file is read before a byte of it is sent, and a refusal says which format it is and which menu in QuickTime Player fixes it. The same pass takes out the sound, down to its bytes, and whatever else a phone or a Mac writes beside the picture, because the stored file sits at a public address and a voice in the room is not part of a component.

The limit is 25 MB, which is about a minute of a recorded window or 24 seconds of a whole retina screen, measured off real recordings. The AI never sees the video. The browser draws five stills across it and sends them as one request, told they are one clip in order, which is how a description can say that a card slides right and grows. On a test clip that did exactly that, it came back as an expanding card and tagged as one.

**A demo that promised a save it didn't have.** The demo is a copy of my library, so it goes stale quietly. Its component Add replayed a block I no longer had: the bar ran, said it was saved, and nothing appeared. Visuals had never been turned on there at all. The demo now has all four kinds, each with its own staged save, and the script that fills it says so when one has nothing to replay. Filling it showed me something worse. The copy shares its image files with my library, so deleting a site would have taken its screenshots out of the demo too. A file is now only deleted once nothing else uses it.

**A field wearing the browser's clothes.** The address field in Add looked heavier than everything around it. It had never been given a background, so in dark mode the browser filled it with its own grey, inside a border at full strength that looked the same whether you were in it or not. It now wears the drop box's fill and edge, with a lighter line when you click in.

**A search that couldn't find the client.** I saved Uber's rebrand, searched for Uber, and found nothing. Each image is titled for what is in it, like a bus stop sign, and the client's name lives on the project it came from. Search now reads the project's name as well, on the board, across tabs and from a connected AI.

**A queue that was never on time.** Imports were meant to move every fifteen minutes. Looking into one slow save, I counted the actual runs: three to five a day, a typical gap of four and a half hours, and one of ten and a half. GitHub starts scheduled jobs when it has room. Every run had succeeded, so nothing looked broken. The schedule lives in the database now, still free, and each run leaves a note of when it happened.

**A post that credited LinkedIn.** I saved a motion designer's LinkedIn post and the app got two things wrong at once. It said the work was by LinkedIn, and what looked like the video was only its preview picture, with the play button painted on. A post is now read as a post: the credit is the person, linking to their profile, and the clip itself is kept, so it's still there if they delete it. The page also carries other people's posts underneath, so only the first one is read, or someone else's work would be saved under their name. The credit can be edited by hand too, for the platforms that can't be read.

**The AI was judging clips by their cover.** An uploaded clip gets five stills, because the browser that uploads it can open it. A clip saved from a link got one, its cover, and the cover of that LinkedIn post was a plain blue gradient, so its description was about gradients. Linked clips are now looked through in the picker before the AI is asked, in the same single request. Clips saved earlier get theirs the next time you press Regenerate.

**One busy model stopped the rest.** Three free AI models stand behind every description, each with its own daily allowance. The app moved to the next one when a model ran out, but not when it was busy. While I was saving a clip, the first had run out, the second was overloaded, and the third was never asked. A busy model now gets one more try before the next takes over, all inside the minute the server allows.

**Every clip says what it is.** Clips were tagged by subject, so there was no way to pull up just the motion work. Each one is now tagged Video when it was filmed and Motion Graphics when it was designed. The AI picks which of the two, and the app makes sure there is one, because a rule I'd have to check isn't a rule.

**When a page won't let it in.** A studio's case study wouldn't save because its site turns away anything that isn't a person at a browser. I tried a bookmark that read the page from my own tab, and took it out the same day: setting it up was more work than the paste it replaced. Pasting the link is still the whole workflow. When a page refuses, the same screen says so and takes the images there, dropped or pasted, filed under the link with the studio's name already filled in to correct.

**A button where the browsing happens.** Pasting a link means leaving the page you found. Raindrop had a button in the browser, and that was the habit I had to replace. Kivli has one now: press it on any page, choose what to save it as, file it in a collection and carry on. Saving runs behind the panel, because the panel is gone the moment you click back into the page, so a save you walk away from still finishes and the icon says how it went.

Three things came out of testing it. The collection list opened in the flow and made the panel 708 pixels tall, past the 600 Chrome allows, so Save dropped off the bottom; it floats inside the panel now. A folder you choose yourself is left alone, where the AI used to add up to two of its own beside it. And the panel says when you already have the page, which turns a second save into filing the first one.

That version still couldn't save the one case study I'd built it for. It asked Kivli's server to read the page, and the page was blocking Kivli's server. The panel now reads the page itself, from the tab that already has it open, and lists its images to tick. Only what's ticked leaves the browser. A clip is the exception: something has to draw frames from it for the AI, so those finish in Kivli's own picker, already ticked. Component can photograph the screen as it stands, which is the only way to keep something that needs a sign-in or an open menu.

Testing that found an image that loads as you scroll being thrown away for its size, because what it had so far was a one-pixel placeholder.

The first time I used it, the button was gray and the panel said Chrome wouldn't allow it on that page. It was nothing to do with the page. Chrome had picked up the new panel and gone on running the old permissions, and my error message blamed the only thing it could see. The panel checks its own version first now and offers to finish updating. I also took out a second button that asked Kivli to read the page instead, because it failed on exactly the pages the first one was for.

**Writing down what it does with people's data.** The Chrome Web Store needs a privacy policy, and writing an honest one was a review in itself. Websites are photographed by a free job on a public code repository, and its public log printed the address of everything anyone saved. The address is hidden from the log now. The free AI plan also lets Google learn from what it's sent, so the page says so and says not to save anything confidential.

Checking the page line by line against the code found a claim that wasn't true: deleting a component left its screen grab stored. It goes now.

**Cropping looked like the home page.** Cropping a component happened on the dashboard, under the headline and the tabs, so a step in saving something looked like going home. It has its own page now, with the same three beats as picking images: a loading bar over grey shapes, the thing to choose from, then the result. The box had a fault too. It was measured in screen pixels once, when the image loaded, so zooming or resizing left it working to a size the image no longer was. It is kept as a share of the image now, which is right at any size.

**The tags page, with room to aim.** The first version of this page did the job and looked unfinished. The title, the list and the tags sat almost on top of each other, six tags across, with Hide and Edit at the far edge of the screen from the group they change. The list and the tags each have a holding shape now, the page opens with room under its title, the two buttons sit beside the group's name, and there are never more than four tags across at any width. The longest group grew from 1,984 to 3,063 pixels for it, which is worth it when the thing you do there is aim.

**Every button, hovered on purpose.** The Save button went white on white when you pointed at it, and it wasn't the first. Instead of looking for the next one, I had a script force the hover state on every control it could reach, on every page and dialog, in both themes, and measure the contrast. It found that one at 1.12 to 1, a Delete that turned grey, a disabled Merge that reacted, and a handful with no hover at all. After the fixes it finds nothing under 4.5 to 1.

Still open: Intercom stays slightly soft, because no bigger version of its mark exists anywhere. Case studies' looping videos are confirmed on the live app, and uploading your own images is live too. Importing components and visuals from a bookmarks file, uploading a component or a clip, the browser button, and tag groups of your own still have to be proven there.

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
matching everything. Merging is a drag now. The reminder to do it still isn't there.

---

## Notes for reusing this

The canonical version of this case study is the page at `app/case-study/page.js`
in the repo, which renders at `/case-study` using the product's own design
tokens. This file is the same content in a portable form: paste it into a
portfolio site, a PDF, or a Notion page.

If you edit one, edit the other. They are deliberately kept in sync.
