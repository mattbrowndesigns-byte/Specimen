"use client";
import UtilityBar from "../_ui/UtilityBar";
import SiteFooter from "../_ui/SiteFooter";

// What it is and why it works the way it does. The features have their own
// page; this one is for the reasoning behind them.
export default function AboutPage() {
  return (
    <>
      <UtilityBar />

      <main className="page prose-page">
        <header className="prose-head">
          <h1>About Kivli</h1>
          <p className="prose-lede">
            A design library for UI, UX and product designers. It does the filing, so saving
            something and finding it again are both things you do in seconds.
          </p>
        </header>

        <section className="prose-row">
          <div className="prose-section prose-row-aside">
            <h2>The problem it solves</h2>
            <p className="prose-aside-note">Why a folder of bookmarks never works.</p>
          </div>
          <div className="prose-section">
            <p>
              Every UI, UX and product designer has a folder of bookmarks they never open again.
              The saving is easy. It is the finding that fails. Six months later you remember a
              pricing page with a comparison table and a warm off-white background, and none of
              that is in the bookmark, which says only <em>stripe.com</em> and points at a page
              that has since been redesigned.
            </p>
            <p>
              Kivli closes both gaps. It keeps what the page actually looked like on the day you
              saved it, and it writes down enough about that page that a half-memory is enough to
              find it again.
            </p>
          </div>
        </section>

        <section className="prose-row">
          <div className="prose-section prose-row-aside">
            <h2>How a save works</h2>
            <p className="prose-aside-note">One paste, then five things you do not have to do.</p>
          </div>
          <div className="prose-section">
            <ol className="prose-steps">
              <li>
                <strong>You paste a URL.</strong> That&rsquo;s the whole interaction. Everything
                after this happens on its own.
              </li>
              <li>
                <strong>A real browser opens the page.</strong> It scrolls the whole thing so lazy
                sections load, freezes animations, hides the cookie banner, and photographs it at
                desktop and mobile widths.
              </li>
              <li>
                <strong>The same browser measures the interface.</strong> Every colour weighted by
                the area it covers, and the typefaces that actually rendered, with a specimen
                drawn from the live page. That is the only honest way to show a licensed font.
              </li>
              <li>
                <strong>An AI reads the screenshot.</strong> It writes a summary, tags the page four
                ways, names every distinct block on it, and picks out the site&rsquo;s key pages.
              </li>
              <li>
                <strong>It lands in your review queue.</strong> Nothing written for you is treated as
                settled until you&rsquo;ve read it.
              </li>
            </ol>
            <p>
              <a className="prose-link" href="/features">
                The full list of what it does →
              </a>
            </p>
          </div>
        </section>

        <section className="prose-row">
          <div className="prose-section prose-row-aside">
            <h2>A few decisions worth knowing</h2>
            <p className="prose-aside-note">The reasoning behind how it behaves.</p>
          </div>
          <div className="prose-section">

            <h3>The AI writes a draft, not a verdict</h3>
            <p>
              Every summary is editable, every tag removable, and the tag vocabulary is yours.
              Rename or merge a tag and the next pass uses your words. Tags the AI invents wait for
              your approval, which is what stops <em>minimal</em>, <em>minimalist</em> and{" "}
              <em>clean minimal</em> all ending up in the same library.
            </p>
            <h3>Measured, not guessed</h3>
            <p>
              The palette isn&rsquo;t read out of a stylesheet, because a stylesheet declares
              thousands of rules the page never paints. It&rsquo;s measured off the rendered page and
              weighted by area. Photographs are deliberately excluded, because a palette taken
              from the pixels reports the model&rsquo;s jumper in the hero shot rather than the
              design.
            </p>
            <h3>Nothing is thrown away</h3>
            <p>
              Re-capturing keeps the old screenshots. Re-reading a site&rsquo;s style keeps the
              previous reading. Cropping a component leaves the original capture untouched. Hiding a
              save takes it off the dashboard but leaves it in the library and in search.
            </p>
            <h3>It costs nothing to run</h3>
            <p>
              Every part of this sits inside a free tier on purpose: the storage, the browser that
              takes the screenshots, the AI that reads them. That constraint shows in one place.
              When the AI is busy, tagging is queued rather than lost and fills itself in within
              the hour. The screenshots are never affected.
            </p>
          </div>
        </section>

        <section className="prose-cta">
          <h2>Invite-only, deliberately</h2>
          <p>
            Kivli is a personal tool shared with a handful of people rather than a product. Each library
            is separate, and nobody sees anyone else&rsquo;s saves unless it is shared with them.
          </p>
          <a className="prose-cta-link" href="/faq">
            Read the FAQ
          </a>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
