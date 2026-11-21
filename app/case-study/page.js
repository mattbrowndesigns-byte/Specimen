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
                  7<span>every one of them read-only</span>
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
              It reads and nothing more, for now. Writing is the obvious other half, saving a link
              from inside a chat, and it is the half where a mistake gets noticed late. The demo
              library has its own address with no sign-in, so anyone can point their own AI at it
              and try.
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
