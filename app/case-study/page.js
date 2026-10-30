"use client";

// The one page written about the project rather than for the people using it.
//
// It lives in the app instead of anywhere else for the obvious reason: the
// thing it describes is two clicks away, it deploys with everything else, and
// it costs nothing, which is the rule the whole project is built around. It
// takes the prose layout whole -- same 4+8 rows, same sticky headings, same
// closing panel wearing the capture bar's ramp -- and adds only the three
// shapes a case study needs, which live under "Case study" in globals.css.
// The library this page points at, as an env var rather than a literal.
//
// A share token is the whole of a link's authorisation and this repo is
// public, so writing one into the source would put it in git history
// permanently -- including after the link is revoked. It also means the
// showcase link can be swapped or pulled from the Vercel dashboard without a
// deploy. With nothing set the closing panel simply does not render; the page
// reads fine without it.
const SHOWCASE = process.env.NEXT_PUBLIC_SHOWCASE_SHARE;

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

        {SHOWCASE && (
          <section className="prose-cta">
            <h2>See it with real saves in it</h2>
            <p>
              A read-only view of the actual library. No account, nothing to sign up for. Open any
              site to see its captures, its measured palette and its typefaces.
            </p>
            <a className="prose-cta-link" href={`/share/${SHOWCASE}`}>
              Open the library
            </a>
          </section>
        )}
      </main>
    </>
  );
}
