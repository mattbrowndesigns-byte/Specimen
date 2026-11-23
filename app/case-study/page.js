"use client";

// The one page written about the project rather than for the people using it.
//
// It lives in the app instead of anywhere else for the obvious reason: the
// thing it describes is two clicks away, it deploys with everything else, and
// it costs nothing, which is the rule the whole project is built around. It
// takes the prose layout whole -- same 4+8 rows, same sticky headings, same
// closing panel wearing the capture bar's ramp -- and adds only the three
// shapes a case study needs, which live under "Case study" in globals.css.
//
// The closing panel points at /demo, the real app on a read-only pass. It used
// to point at a share link held in NEXT_PUBLIC_SHOWCASE_SHARE, which was never
// set on Vercel, so the panel never rendered in production -- and a share page
// shows the library without the product, which /demo was built to fix.

export default function CaseStudyPage() {
  return (
    <>
      <main className="page prose-page">
        <header className="prose-head">
          <h1>A design library that reads the sites you save</h1>
          <p className="prose-lede">
            Paste a URL. It photographs the page, measures the colours it actually paints,
            identifies the typefaces from their letterforms, and files it against a vocabulary I
            already design in.
          </p>
          <dl className="case-meta">
            <div>
              <dt>Role</dt>
              <dd>Solo: research, product, interface, code</dd>
            </div>
            <div>
              <dt>Running cost</dt>
              <dd>$0 a month, permanently</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>In daily use</dd>
            </div>
          </dl>
        </header>

        <section className="prose-row">
          <div className="prose-section prose-row-aside">
            <h2>The problem was my own filing</h2>
          </div>
          <div className="prose-section">
            <p>
              I had about a hundred sites saved in Raindrop and I could not find any of them.
            </p>
            <p>
              Not because the tool was bad. Because saving a link takes two seconds and filing it
              properly takes two minutes, so I never did the second part. Six months of that and I
              had a folder called &ldquo;inspiration&rdquo; with ninety items in it, each one a
              title and a favicon, and no way to answer the only question I ever actually asked:{" "}
              <em>what was that site with the stat strip that scrolled sideways?</em>
            </p>
            <p>
              Every tool I tried had the same shape. They all assumed the person saving would also
              do the describing. Nobody does the describing.
            </p>
            <p className="case-point">
              So the filing has to happen without me. The whole interaction is one paste.
            </p>
          </div>
        </section>

        <section className="prose-row">
          <div className="prose-section prose-row-aside">
            <h2>The constraint that shaped everything</h2>
          </div>
          <div className="prose-section">
            <p>
              I gave myself a hard rule: this costs nothing to run, forever. No trials, no free
              tiers that expire, no card on file anywhere.
            </p>
            <p>
              That one rule made most of the architectural decisions for me, and it made them
              better than a budget would have. Screenshots run on free CI minutes instead of a $17
              a month screenshot API. The AI runs on a free tier that allows twenty requests a day
              per model, which turned out to be the most interesting design problem in the
              project. A limit that tight forces you to be honest with people about what is and is
              not happening.
            </p>
            <dl className="measure-grid">
              <div>
                <dt>Daily AI budget</dt>
                <dd>
                  60<span>requests, across three models</span>
                </dd>
              </div>
              <div>
                <dt>Cost of one saved site</dt>
                <dd>
                  2<span>tags, then typefaces</span>
                </dd>
              </div>
              <div>
                <dt>Screenshots</dt>
                <dd>
                  Free<span>unlimited CI minutes</span>
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="prose-row">
          <div className="prose-section prose-row-aside">
            <h2>The vocabulary had to be the one I already think in</h2>
          </div>
          <div className="prose-section">
            <p>
              The first version let the AI pick its own words and produced exactly what you would
              expect: <em>minimal</em>, <em>minimalist</em> and <em>clean minimal</em> all
              describing the same page. So the vocabulary became a closed, faceted list: what the
              site is for, what kind of page it is, what blocks are on it, and how it looks.
            </p>
            <p>
              The block list took two tries. Version one had Hero, Footer, Accordion, CTA Band.
              Every site ever made has a hero and a footer, so a tag naming only the family matches
              everything and finds nothing. I had written &ldquo;never tag it as just hero&rdquo;
              into the instructions from the very beginning and it never once worked.
            </p>
            <p>
              It took me far too long to see why. The instruction said one thing and the menu it
              was choosing from said another.
            </p>
            <p className="case-point">
              The instruction was arguing with the menu, and the menu won.
            </p>
            <p>
              Every value is family then variety now, and the families are the ones from the design
              system I work in every day. The words that come back are the words I would have
              searched for.
            </p>
            <div className="case-chips">
              <span className="chip chip-was">Hero</span>
              <span className="chip chip-was">Logo Wall</span>
              <span className="chip chip-was">Bento Grid</span>
              <span className="chip chip-now">Hero Carousel</span>
              <span className="chip chip-now">Logo Strip</span>
              <span className="chip chip-now">Card Bento</span>
            </div>
          </div>
        </section>

        <section className="prose-row">
          <div className="prose-section prose-row-aside">
            <h2>Colours are measured, not parsed</h2>
          </div>
          <div className="prose-section">
            <p>
              The obvious way to get a site&rsquo;s palette is to read its stylesheet. It does not
              work. A stylesheet declares thousands of rules the page never paints, and how often a
              colour appears in CSS says nothing about how much of the screen it covers.
            </p>
            <p>
              So Kivli opens the page in a real browser and weights every colour by the area it
              actually covers. Backgrounds minus whatever their children paint over them. Borders
              as perimeter times width. Text as <strong>ink</strong>, roughly 14% of the em square
              per character, because otherwise one paragraph outweighs an entire hero panel.
              Photographs are skipped on purpose: a palette taken from pixels reports the
              model&rsquo;s jumper in the hero shot, not the interface.
            </p>
            <p>
              Then the measurement broke on its own terms. One site&rsquo;s teal sat on a single
              newsletter button. By area it was invisible. By chroma it was the most deliberate
              colour on the page.
            </p>
            <dl className="measure-grid">
              <div>
                <dt>Share of painted area</dt>
                <dd>
                  0.0157%<span>against a 0.2% floor</span>
                </dd>
              </div>
              <div>
                <dt>Chroma</dt>
                <dd>
                  213<span>next colour down: 45</span>
                </dd>
              </div>
            </dl>
            <p className="case-point">Area is the wrong question to ask about an accent.</p>
            <p>
              A call to action is deliberately small and deliberately the most saturated thing on
              the page. So two colours can be readmitted from under the floor, but only when they
              are painted on something clickable <em>and</em> highly saturated. Both halves matter:
              without the first test it readmits every stray tint, without the second it readmits
              every dark grey button. That same site&rsquo;s dark grey search button is correctly
              still left out.
            </p>
          </div>
        </section>

        <section className="prose-row">
          <div className="prose-section prose-row-aside">
            <h2>The panel was right and my intuition was wrong</h2>
          </div>
          <div className="prose-section">
            <p>
              Kivli reports typefaces by role: headline, body and UI, accent. On one site I was
              certain it had made a mistake. The company has a typeface named after itself, and the
              panel had filed that face as chrome rather than as the interface face.
            </p>
            <p>It was right.</p>
            <dl className="measure-grid">
              <div>
                <dt>The face named after the company</dt>
                <dd>
                  1,119<span>characters, almost all footer legal</span>
                </dd>
              </div>
              <div>
                <dt>The face actually carrying the page</dt>
                <dd>
                  3,259<span>characters of body copy</span>
                </dd>
              </div>
            </dl>
            <p>
              <strong>A face&rsquo;s role comes from where it is set, and the footer counts.</strong>{" "}
              I keep this one in the notes because it is the clearest case of the measurement
              knowing more than I did, and it is worth remembering before &ldquo;fixing&rdquo; a
              result that looks surprising.
            </p>
          </div>
        </section>

        <section className="prose-row">
          <div className="prose-section prose-row-aside">
            <h2>Images are a library of their own</h2>
          </div>
          <div className="prose-section">
            <p>
              Half of what I save from a studio&rsquo;s site is not the site. It is the work on it: the identity system on a bus shelter, the packaging, the poster series. Saving the page as a website photographed the case study&rsquo;s layout and lost the pictures I actually came for.
            </p>
            <p>
              So images became a fourth library. Paste a project page and Kivli pulls every image off it, guesses which ones are the work with a free heuristic, then spends one AI request sorting and describing the lot. A picker shows its choices and I make the final call; anything left out is deleted from storage, so a page only ever costs space for what I chose.
            </p>
            <p className="case-point">
              A logo and that logo on a bus are two findings.
            </p>
            <p>
              That is why each image is its own card on a board rather than one card per project. Grouping still happens, on the image&rsquo;s own page, where the rest of the project sits underneath it. The project&rsquo;s paragraph is written once and shown there, instead of being copied onto every image it came with.
            </p>
            <p>
              The vocabulary is three facets. Industry and aesthetic are shared with websites, because Brutalist means the same thing on a billboard as on a homepage. Medium is its own: poster, packaging, signage, identity system. Words a designer would search for, from a closed list, for the same reason the block vocabulary is one.
            </p>
            <dl className="measure-grid">
              <div>
                <dt>Requests to sort and describe a page</dt>
                <dd>
                  1<span>however many images it has</span>
                </dd>
              </div>
              <div>
                <dt>Facets on every image</dt>
                <dd>
                  3<span>medium, industry, aesthetic</span>
                </dd>
              </div>
            </dl>
            <p>
              Two guards came from running it for real. A title is two to six words by instruction, and one came back as hundreds of words of looping filler, so anything past eight words is treated as that and replaced. And files are named by their content and cached for a year, because the free plan&rsquo;s limit on what a board of images can serve is the first one a library like this would hit.
            </p>
            <p>
              Two things it could not hold at first. A screenshot on my desktop had no page to paste, and case studies loop MP4s that a still frame records badly. Uploads go from the browser straight into storage on a signed link, because Vercel refuses a request over 4.5 MB and a retina screenshot of a long page is often bigger; the server only reads the file back to make the WebP. A batch of uploads is described in one request, like a page.
            </p>
            <p>
              Videos are kept as muted loops of up to 15 MB each, because the free plan&rsquo;s 1 GB holds every capture and every image too. On Jade Kuzak&rsquo;s Gemini page, three of the six loops were over that, and the picker says so rather than letting the page look as if it had none.
            </p>
            <p className="case-point">
              The server has no video decoder. Every browser is one.
            </p>
            <p>
              The board lays everything out by a still, and the AI can only look at one. Focus Lab&rsquo;s pages hand over a poster with every video; Cargo sites like Jade Kuzak&rsquo;s hand over none. Decoding video on the server would mean a large binary on a free function, so for a video with no poster the picker plays the stored file in the browser, draws a frame a second in, and sends that back as the poster.
            </p>
            <dl className="measure-grid">
              <div>
                <dt>Largest video kept</dt>
                <dd>
                  15 MB<span>of a 1 GB free plan</span>
                </dd>
              </div>
              <div>
                <dt>Largest request Vercel accepts</dt>
                <dd>
                  4.5 MB<span>so uploads go straight to storage</span>
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="prose-row">
          <div className="prose-section prose-row-aside">
            <h2>Two progress bars, not one percentage</h2>
          </div>
          <div className="prose-section">
            <p>
              A hundred imported bookmarks is two hundred AI requests against a tier that allows
              sixty a day. &ldquo;How long until this is done&rdquo; has no honest answer.
            </p>
            <p>
              But it has two answers. Screenshots cost free CI minutes and finish in hours. Tags
              cost the scarce thing and finish over days. One bar averaging those is wrong about
              both.
            </p>
            <p className="case-point">
              All your screenshots are in. Tagging resumes at 12:05 AM.
            </p>
            <p>
              Keeping them apart is what lets the panel say that instead of saying{" "}
              <em>61%</em>. The import bar also does not pulse, unlike the capture bar it otherwise
              copies. The capture bar animates because it describes a minute you are watching. This
              one describes three days you are not, and a stripe sliding under a still fill would
              be claiming activity it cannot vouch for.
            </p>
          </div>
        </section>

        <section className="prose-row">
          <div className="prose-section prose-row-aside">
            <h2>A unit that lies about what it measures</h2>
          </div>
          <div className="prose-section">
            <p>
              I set the reading measure on the written pages to 74ch, which reads in the source
              like a 74 character line. A ch is the width of the digit zero, one of the widest
              glyphs in a proportional face.
            </p>
            <dl className="measure-grid">
              <div>
                <dt>What the source says</dt>
                <dd>
                  74<span>characters, apparently</span>
                </dd>
              </div>
              <div>
                <dt>What it actually fitted</dt>
                <dd>
                  102<span>characters of real prose</span>
                </dd>
              </div>
            </dl>
            <p>
              The measure is 34em now, about 75 characters, arrived at by setting a long paragraph
              and dividing its width by the width of 100 characters of actual text. Measured, not
              calculated. It is the small version of the lesson the whole project kept teaching me.
            </p>
          </div>
        </section>

        <section className="prose-row">
          <div className="prose-section prose-row-aside">
            <h2>The interface kept saying things that were not true</h2>
          </div>
          <div className="prose-section">
            <p>
              Switch from Resources back to Websites and, for half a second, a library of 44 saves
              said &ldquo;Start your library&rdquo; and &ldquo;0 sites&rdquo;. Each tab loads
              fresh when you open it, its list starts empty, and an empty list was being drawn as
              an empty library.
            </p>
            <p>
              Half a second sounds harmless. On the demo, in front of someone deciding whether to
              keep reading, it looks like a product that has just lost everything.
            </p>
            <p className="case-point">
              Nothing on screen yet is a different answer from nothing there.
            </p>
            <p>
              Each tab now waits for a real response before it says anything about what you have.
              Until then it shows a skeleton built from the real cards and rows, so nothing moves
              when they arrive, and a failed request stays loading rather than describing a
              library it never read.
            </p>
            <p>
              The filters had a quieter version of the same fault. Two columns put each count at
              the far edge, so Landing&rsquo;s 31 sat nearer Homepage&rsquo;s checkbox than its
              own word, and the list offered tags with nothing filed under them, each one a
              promise of results that did not exist. They are pills now, each holding its own
              count, and a tag is not offered until something carries it.
            </p>
          </div>
        </section>

        <section className="prose-row">
          <div className="prose-section prose-row-aside">
            <h2>Two redesigns, used side by side</h2>
          </div>
          <div className="prose-section">
            <p>
              Once the product worked I wanted it to look like it did. Rather than redesign in
              place, I built two alternatives next to the version that shipped: Elevated, an
              ambitious exploration, and Refined, a quieter one. All three ran on the same data,
              and I switched between them while actually using the app, not while looking at
              screenshots.
            </p>
            <p>
              Refined won, and then it took four things from Elevated that only showed their worth
              in use: capsule buttons, a shaded side panel on a site&rsquo;s page, the viewer&rsquo;s
              controls on one row, and a search bar that stays put while you scroll. A second pass
              took Elevated&rsquo;s near-black palette and its type hierarchy. The borderless
              cards, the heavier shadows and the tabbed inspector stayed behind.
            </p>
            <p>
              My favourite detail came from a bug. Elevated forgot to exclude the remove button on
              a tag from a rule that turned every button into a pill, so each tag got an
              accidentally generous &times;. It was the easiest target in the panel. Refined has it
              on purpose.
            </p>
            <p>
              The original is kept, reachable, for exactly this page. The new design is a layer
              that applies only where a page is marked for it, and the original is the absence of
              that mark, so no new rule can reach it. Then I checked rather than trusted.
            </p>
            <dl className="measure-grid">
              <div>
                <dt>Pages fingerprinted</dt>
                <dd>
                  4<span>every element&rsquo;s style and box, hashed</span>
                </dd>
              </div>
              <div>
                <dt>Differences in the original</dt>
                <dd>
                  0<span>before, during and after the redesign</span>
                </dd>
              </div>
            </dl>
            <p>
              <a className="prose-link" href="/demo-original">
                The original design &rarr;
              </a>
              <br />
              <a className="prose-link" href="/demo-elevated">
                The exploration it borrowed from &rarr;
              </a>
            </p>
          </div>
        </section>

        <section className="prose-row">
          <div className="prose-section prose-row-aside">
            <h2>The portfolio link is the real app</h2>
          </div>
          <div className="prose-section">
            <p>
              The first public demo was the share page, a read-only grid of screenshots. It showed
              the library and none of the product. What makes Kivli read as software is the
              search, the filters, the view switches and a site&rsquo;s own page, and rebuilding
              all of that read-only would have meant a second copy of the app that slowly stops
              matching the first.
            </p>
            <p>
              So the demo link hands a visitor a signed pass that the server reads as a demo
              account, and one rule at the door refuses every change it tries to make.
            </p>
            <dl className="measure-grid">
              <div>
                <dt>Routes that can change data</dt>
                <dd>
                  39<span>saving, tagging, sharing, deleting</span>
                </dd>
              </div>
              <div>
                <dt>Rules guarding them</dt>
                <dd>
                  1<span>at the door, not one per route</span>
                </dd>
              </div>
            </dl>
            <p>
              It is deliberately not a real login. A real session handed to strangers could be
              pointed at the database directly, around the app. A pass only this server can check
              leaves nothing to go around.
            </p>
            <p>
              Saving is the one thing a demo has to show and the one thing it cannot do for real,
              because every save spends my own twenty-a-day AI budget. So Add is staged: the
              address is locked to ramp.com, the field says so, and a twelve second bar plays
              before the card lands. Every screenshot and tag it reveals is real output from a real
              save.
            </p>
            <p className="case-point">
              Staged and saying so reads as a designed demo. Staged and hiding it reads as a trick.
            </p>
            <p>
              First-time visitors get a seven-stop tour that ends by opening Add, and their visits
              are counted under their own path, so I can tell a stranger from myself.
            </p>
          </div>
        </section>

        <section className="prose-row">
          <div className="prose-section prose-row-aside">
            <h2>Handing the library to someone else&rsquo;s AI</h2>
          </div>
          <div className="prose-section">
            <p>
              A product designer friend put it simply: the research happens in Kivli, and then the
              work happens in an AI chat, and nothing carries one into the other. Gathering a
              project&rsquo;s references into a collection was only half useful if they stayed
              there.
            </p>
            <p>
              So every save and every collection has a Copy for AI button. It produces a plain
              Markdown file, which every model reads, and a download beside it for dropping the
              same file into a project folder. I did not build &ldquo;Open in ChatGPT&rdquo;.
              Those links carry the whole text in the address, which a collection outgrows, and
              they pick the reader&rsquo;s model for them.
            </p>
            <p>
              The interesting part was what to say at the top. Not a product pitch, and not a
              prompt, because the reader brings their own question. What a model actually needs is
              how far to trust each part: the colours and type were measured in a real browser,
              the tags and summary were written by a model, and the notes are mine.
            </p>
            <p className="case-point">
              A model that knows which lines were measured weighs a note above a guess. One that
              doesn&rsquo;t treats them as equals.
            </p>
            <dl className="measure-grid">
              <div>
                <dt>AI requests per copy</dt>
                <dd>
                  0<span>rendered from what is already known</span>
                </dd>
              </div>
              <div>
                <dt>A six-item research collection</dt>
                <dd>
                  3,885<span>words, dated, with what they share up top</span>
                </dd>
              </div>
            </dl>
            <p>
              Every file says when it was made, and the same thing always downloads under the same
              name, so a fresh copy replaces a stale one instead of sitting beside it. What text
              cannot do is carry a picture: the screenshots are links, and most chat apps will not
              open a link to look. That is the case for the next step, a connection an AI can
              search directly and see the images through.
            </p>
          </div>
        </section>

        <section className="prose-row">
          <div className="prose-section prose-row-aside">
            <h2>Letting the AI look for itself</h2>
          </div>
          <div className="prose-section">
            <p>
              Copying fixed the carrying, and showed what was still missing. The question a
              designer asks halfway through a project is rarely &ldquo;here is my collection&rdquo;.
              It is &ldquo;have I saved a pricing page like this?&rdquo;, and answering that means
              the AI has to be able to look.
            </p>
            <p>
              So Kivli is now an MCP server, the open standard Claude, ChatGPT and most coding
              tools use to reach outside data. Connect an AI once and it can search the library,
              open a save, read a collection and find things like the one in front of it.
            </p>
            <p>
              Images travel with the answer. A site comes back with the top of its screenshot
              attached, and the rest of the page is cut into numbered sections the model asks for
              one at a time. A full page handed over whole gets squeezed to a postage stamp, which
              is the same lesson the tagging learned from Gemini.
            </p>
            <p>
              &ldquo;Similar&rdquo; is not a model&rsquo;s opinion. It ranks by shared tags, which
              are a curated vocabulary, then by shared typefaces, and every result says what it
              shares. No request is spent, and the answer can be checked.
            </p>
            <p>
              Signing in is Supabase&rsquo;s job. Its OAuth server issues and refreshes the
              tokens, and Kivli&rsquo;s part is one consent page that says what the app will and
              won&rsquo;t be able to do. Disconnecting it signs the app out on its very next call,
              which I tested rather than assumed.
            </p>
            <p className="case-point">
              The library stopped being somewhere you go, and became something your tools can ask.
            </p>
            <dl className="measure-grid">
              <div>
                <dt>Tools an AI can call</dt>
                <dd>
                  11<span>seven that read and four that add</span>
                </dd>
              </div>
              <div>
                <dt>Added to the monthly bill</dt>
                <dd>
                  $0<span>on the same free tiers as everything else</span>
                </dd>
              </div>
            </dl>
            <p>
              Reading came first, and writing was the obvious other half. The research happens in
              the chat. After twenty minutes comparing typefaces with an AI, the two you settle on
              should not need copying out by hand. So a connected AI can now save websites and
              resources, make a collection and file things into it, all from one sentence:
              &ldquo;add these three sites to a new collection for the Acme project&rdquo;.
            </p>
            <p>
              It adds and nothing else. No tool deletes, edits or retags, so a misread request
              leaves something to tidy up rather than something to recover. A save from a chat runs
              the same code as one from the Add box. I moved that code out of the app&rsquo;s
              routes so there would only be one copy of it. Ask for more than three sites at once
              and the rest join the import queue, because the free AI tier allows about ten saves a
              day. A tool that ignored that would be promising tags it could not deliver.
            </p>
            <p>
              The first font I saved this way came back titled &ldquo;Google Fonts&rdquo;. The page
              calls itself &ldquo;Inter - Google Fonts&rdquo;, and the title cleanup keeps the
              site&rsquo;s half of that. The AI already knows which font it was asked to save, so
              the tool now takes a title from it.
            </p>
            <p>
              The demo library still has its own address with no sign-in, so anyone can point their
              own AI at it and try. It stays read-only because the four tools that write are only
              given to a signed-in owner.
            </p>
          </div>
        </section>

        <section className="prose-row">
          <div className="prose-section prose-row-aside">
            <h2>The details I&rsquo;m still pushing on</h2>
          </div>
          <div className="prose-section">
            <p>
              None of these is a story on its own. Together they are most of the difference between a tool that works and one that feels finished, so I keep them written down: what looked wrong, what was actually wrong, and what changed.
            </p>
            <h3>A blurry logo was a rule, not a file</h3>
            <p>
              Intercom&rsquo;s mark looked soft in the header. It wasn&rsquo;t a bad image: Kivli picked a site&rsquo;s icon by whether it loaded, and Google&rsquo;s only Intercom icon is 48 pixels, drawn here at 88 on a sharp screen. Asking for a bigger one changes nothing, because Google quietly sends the size it has. Now every candidate is measured and the first one big enough wins, a site with no large icon anywhere keeps its sharpest, a round mark is scaled to meet its circle, and a site with no icon at all gets its initial on a colour of its own. A script re-asks for every save whenever the rule changes.
            </p>
            <h3>One tooltip, drawn above everything</h3>
            <p>
              Some controls had a styled grey pill and most had the browser&rsquo;s own label, which waits a second and a half and looks different on every screen. The pill could not simply be copied everywhere: on a card it was clipped by the card&rsquo;s rounded edge. It is now one piece that draws on top of the whole page, used by about forty controls.
            </p>
            <h3>Copy and download are one control</h3>
            <p>
              Every save and collection had Copy for AI and, beside it, a bare download icon with nothing holding it. The first fix made them one capsule with two targets inside it, the label copying and an arrow opening a menu, and two things to press in one shape was one too many. It is a single button now, Export for AI, opening a menu with Copy and Download, and no tooltip, because the menu says what each does. The menu is drawn above the whole page, because in the image viewer the panel it sat in cut its left half off.
            </p>
            <h3>A strip that sat off-centre by four pixels</h3>
            <p>
              The tag strip under the search measured 12 pixels above and 8 below on Websites, and 12 above and 18 below on Resources, whose view controls also lived on a different line from every other tab&rsquo;s. The first fix set both to 12 and was still wrong to the eye: I had measured to the strip, which carries 8 pixels of padding under its pills so a scrolling row is never clipped. Measured to the pills, the gap below was 20. It is 12 above and below the pills now, on every tab, and the rule says measure what you can see.
            </p>
            <h3>Descenders lost to an animation</h3>
            <p>
              The rolling line on the home page is clipped to its row so the incoming line can&rsquo;t swing through the one below. The clip cut the tails off every y and p. Measured, those tails end 0.05em past the line box, so the clip now allows 0.08em.
            </p>
            <h3>Filters that could only narrow to nothing</h3>
            <p>
              On the image board, picking Signage and then Editorial returned nothing, because it asked for images tagged both. The convention, and what the other libraries already did, is any of the chosen tags within one group and all of the groups together.
            </p>
            <h3>Labels that changed width</h3>
            <p>
              The selected tab went bold, which made its label wider and nudged every tab after it sideways. They all share one weight now; the fill says which one you are in.
            </p>
            <h3>A finished job that looked unfinished</h3>
            <p>
              The import panel was still showing a batch from weeks earlier, two full bars under a gradient band that read as a third bar. A finished batch now stays for the day it finishes and then goes.
            </p>
            <h3>A drop target that refused the drop</h3>
            <p>
              The Add menu offered Upload Images for a visual, in a pill 32 pixels tall, and a screenshot dragged onto it was not taken. Nothing was closing the menu. The button had never been told to accept a drop: a browser refuses a file anywhere the page doesn&rsquo;t claim it, and only the board behind the menu did, only while that tab was open. It is a box now, 168 pixels tall, that takes the drop and lights up as a file crosses it, and a near miss no longer opens the file in place of the app. The progress moved as well. It sat inside the menu, the one save that kept its menu open, so an upload now closes it and reports in the same panel every other save does. The bar there is the bytes actually sent, and once there is no figure to give it stops giving one.
            </p>
            <h3>Uploading a component</h3>
            <p>
              The first real use of image uploads, for Visuals, raised the next question: a screenshot of one good pricing table is a component, and the only way to save one was to capture a whole page and crop it. An uploaded image now joins the same list a captured page waits on, already ready to crop, so the crop tool, the list and Discard needed no second version. What is different is that cropping is optional. A screenshot is often already just the component, so there is a button to use it as it is, and one to keep a whole batch.
            </p>
            <p>
              Doing it turned up a gap. Websites, resources and visuals all wait in line when the AI is too busy to describe them. Components never did: one saved on a busy day stayed untitled until I noticed. They share the same line now, uploaded or not.
            </p>
            <h3>Three rows you couldn&rsquo;t choose between</h3>
            <p>
              The list of AI apps with access showed Claude three times, because adding the connector again records a new approval. My first fix added a paragraph explaining that and a time on each row, and two of the three times were the same. Explaining a confusing list is not fixing it. It is one row per app now, with its number of approvals and one Disconnect for all of them, and it stays out of the way until something is connected.
            </p>
            <h3>A features page telling an old story</h3>
            <p>
              The features page still opened with pasting a URL, and filed 37 cards by topic, so components had one and nobody could tell there were four kinds of thing to save. The obvious fix was to group it by kind. I sorted the list first, and 20 of the 37 belonged to no single kind, so they would have been repeated four times or dropped. It leads with the four kinds now, then what each does, then what works across all of them, in 28 cards. One claim had quietly become false on the way: that everything the AI writes waits for review.
            </p>
            <h3>A component that moves</h3>
            <p>
              The next thing I tried to upload was a screen recording, because some components are only worth saving for how they move. A clip is kept whole, so there is no crop to offer and the page says so rather than showing a control that does nothing. Its card shows one frame with a play mark; its own page plays the clip, muted and looping.
            </p>
            <p>
              A .mov is mostly a label. The screen recordings on my Mac are all H.264 inside, which every browser plays, so nothing has to be converted: the file is relabelled as an MP4 without touching the picture. What is inside can also be HEVC or ProRes, which often will not play in Chrome or Firefox, so the file is read before a byte of it is sent, and a refusal says which format it is and which menu in QuickTime Player fixes it. The same pass takes out the sound, down to its bytes, and whatever else a phone or a Mac writes beside the picture, because the stored file sits at a public address and a voice in the room is not part of a component.
            </p>
            <p>
              The limit is 25 MB, which is about a minute of a recorded window or 24 seconds of a whole retina screen, measured off real recordings. The AI never sees the video. The browser draws five stills across it and sends them as one request, told they are one clip in order, which is how a description can say that a card slides right and grows. On a test clip that did exactly that, it came back as an expanding card and tagged as one.
            </p>
            <p>
              Still open: Intercom stays slightly soft, because no bigger version of its mark exists anywhere. Case studies&rsquo; looping videos are confirmed on the live app, and uploading your own images is live too. Importing components and visuals from a bookmarks file, and uploading a component or a clip, still have to be proven there.
            </p>
          </div>
        </section>

        <section className="prose-row">
          <div className="prose-section prose-row-aside">
            <h2>What I deliberately did not build</h2>
          </div>
          <div className="prose-section">
            <h3>Drag and drop folders</h3>
            <p>
              A folder here is a tag, so one item can sit in two of them and the AI can file it on
              save. Real folders force a choice the library does not need to make, and drag and
              drop buys only re-tagging, which is already one click.
            </p>
            <h3>Sharing a single resource</h3>
            <p>
              A resource <em>is</em> a URL. Sharing one is sending that URL. A share page wrapping
              one link is a redirect with branding on it.
            </p>
            <h3>A flat tag input</h3>
            <p>
              It is a nicer interaction and it loses the faceting, which is the most important
              structural decision in the product.
            </p>
          </div>
        </section>

        <section className="prose-row">
          <div className="prose-section prose-row-aside">
            <h2>What I would change</h2>
          </div>
          <div className="prose-section">
            <p>
              The tag vocabulary needs a periodic merge pass and the app does not prompt for one,
              so two family-only tags from an early version are still live and still matching
              everything. The merge tool exists. The reminder to use it does not.
            </p>
            <p>
              <a className="prose-link" href="/features">
                The full list of what it does &rarr;
              </a>
            </p>
          </div>
        </section>

        <section className="prose-cta">
          <h2>Try it with real saves in it</h2>
          <p>
            The actual app, filled with a copy of my library. No account, nothing to sign up for.
            Search it, filter it, open any site to see its captures, palette and typefaces, and
            watch a save happen.
          </p>
          <a className="prose-cta-link" href="/demo">
            Open the demo
          </a>
        </section>
      </main>
    </>
  );
}
