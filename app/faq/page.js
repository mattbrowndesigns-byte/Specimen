"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import UtilityBar from "../_ui/UtilityBar";
import SiteFooter from "../_ui/SiteFooter";

// The questions that actually come up, grouped by when they come up.
//
// Written as answers rather than as reassurance: several of these exist
// because something looks broken when it isn't -- an empty tag list, a font
// that can't be shown, a save missing from the dashboard.
const SECTIONS = [
  {
    title: "Saving",
    items: [
      {
        q: "How long does a save take?",
        a: "Around a minute. A real browser has to open the page, scroll the whole thing so lazy sections load, and photograph it twice. You don't have to wait for it — leave the page and it carries on.",
      },
      {
        q: "Why did my tags and summary not appear?",
        a: "If you saw a yellow note saying they were queued, the AI was at its rate limit when your save landed. The work isn't lost: it retries on its own and fills in within the hour, usually much sooner. Everything else about the save — the screenshots, the palette, the typefaces — is already done and unaffected.",
      },
      {
        q: "Can I save the same site twice?",
        a: "Yes, and it's often the right thing to do. Each save keeps its own captures, so saving a site again a year later gives you both versions side by side. If you'd rather update the one you have, use Re-capture on its page — that keeps the old screenshots on a timeline too.",
      },
      {
        q: "Can I save a page other than a homepage?",
        a: "Any URL works. Kivli also finds a site's own key pages for you and offers to capture them properly — that's what Promote To Full Capture does on the pages list.",
      },
    ],
  },
  {
    title: "What the AI writes",
    items: [
      {
        q: "Can I change the summary?",
        a: "Edit it like any other text, or use Regenerate to have another go written. Editing counts as reviewing it, so the save leaves your review queue.",
      },
      {
        q: "What is the review queue for?",
        a: "Everything written for you lands there until you've read it. It exists so nothing sits quietly wrong in your library — a summary that missed the point, a tag that doesn't fit. Starring or hiding a save deliberately doesn't clear it, since neither means you've read anything.",
      },
      {
        q: "Some tags look almost the same. Can I tidy them up?",
        a: "Manage Tags is for exactly that: rename, merge or delete, and the AI's next pass uses your vocabulary rather than its own. Tags it proposes arrive unapproved and marked, so you decide whether a new word joins the library.",
      },
      {
        q: "Why do some pages have no tags at all?",
        a: "Either the tagging pass is still queued, or it failed outright — the site's page says which. Re-read Pages runs it again.",
      },
    ],
  },
  {
    title: "Colour and type",
    items: [
      {
        q: "Where do the colours come from?",
        a: "They're measured off the rendered page, not read from its CSS, and weighted by how much of the interface each one actually covers. Images and video are excluded on purpose — a palette taken from the pixels would report the photography rather than the design. Gradients are kept, since those are drawn interface.",
      },
      {
        q: "Why is one colour 80% of the bar?",
        a: "Because it genuinely is. Page backgrounds cover most of a page. The bar's segment widths are compressed so the accents stay visible, but the real percentage is on every swatch — hover one to see it, or expand the list.",
      },
      {
        q: "Is the specimen the real typeface?",
        a: "Yes, where it can be. The letterforms are drawn off the live page by the browser that's already loaded the font, so what you're looking at is the real thing. When that isn't possible, it falls back to a substitute — never silently, since a wrong specimen is worse than an obvious stand-in.",
      },
      {
        q: "Why does a typeface have no closest match?",
        a: "Because none could be confirmed. Every suggested match is checked against Google Fonts and Adobe Fonts before it's shown, and anything that doesn't resolve is dropped rather than displayed. A missing match means the check failed, not that nobody looked.",
      },
    ],
  },
  {
    title: "Finding things",
    items: [
      {
        q: "What does search actually cover?",
        a: "Summaries, notes and tags at once, as well as names and domains. A half-remembered phrase from a summary will find the site.",
      },
      {
        q: "How do the tag filters combine?",
        a: "Tags within one facet widen the search, tags across facets narrow it. Picking Ecommerce and Hospitality finds either; adding Dark finds either of those that are also dark.",
      },
      {
        q: "I hid a save. Where did it go?",
        a: "Out of the dashboard grid and nowhere else. It's still in your library and still turns up in search — hiding is for keeping the grid to what you're working on, not for putting something beyond reach. Its page has the button to bring it back.",
      },
    ],
  },
  {
    title: "The account",
    items: [
      {
        q: "Can anyone else see my library?",
        a: "No. Every library is separate, and nothing is shared between accounts — not saves, not collections, not your tag vocabulary.",
      },
      {
        q: "Can I invite someone?",
        a: "Invites are issued by the owner. Kivli runs entirely inside free tiers, and those tiers are shared across everyone using it, so the number of people is kept deliberately small.",
      },
      {
        q: "Is anything ever deleted automatically?",
        a: "No. Captures, readings and crops all accumulate rather than replace. The only thing that trims itself is style history, which keeps the last twelve readings of a site.",
      },
    ],
  },
];

function Item({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`faq-item${open ? " faq-item-open" : ""}`}>
      <button className="faq-q" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{q}</span>
        <ChevronDown size={16} />
      </button>
      {open && <p className="faq-a">{a}</p>}
    </div>
  );
}

export default function FaqPage() {
  return (
    <>
      <UtilityBar />

      <main className="page prose-page">
        <header className="prose-head">
          <h1>Questions</h1>
          <p className="prose-lede">
            Mostly the ones where something looks broken and isn&rsquo;t. If yours isn&rsquo;t
            here, <a className="prose-link" href="/features">the features page</a> covers what
            each part is for.
          </p>
        </header>

        {SECTIONS.map((section) => (
          <section className="prose-section faq-section" key={section.title}>
            <h2>{section.title}</h2>
            <div className="faq-list">
              {section.items.map((item) => (
                <Item key={item.q} {...item} />
              ))}
            </div>
          </section>
        ))}
      </main>
      <SiteFooter />
    </>
  );
}
