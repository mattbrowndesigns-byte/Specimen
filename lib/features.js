import {
  Monitor,
  Scroll,
  History,
  Archive,
  FileText,
  Tags,
  LayoutList,
  Compass,
  Palette,
  Type,
  Link2,
  GitCompare,
  Search,
  SlidersHorizontal,
  LayoutGrid,
  Sparkles,
  FolderOpen,
  EyeOff,
  Crop,
  ListChecks,
  Tag,
  PenLine,
} from "lucide-react";

// Everything Kivli does, in one list.
//
// Data rather than a component, so the two places that show features can't
// drift apart: the rotator picks a `short` line at random while you wait for a
// capture, and /features lays the whole set out. Adding something here puts it
// in both.
//
// `short` is written to be read in four seconds and on its own. `blurb` can
// assume you came looking.
export const FEATURE_GROUPS = [
  {
    title: "Saving",
    blurb: "Paste a URL. Everything below happens without you doing anything else.",
    features: [
      {
        Icon: Monitor,
        name: "Desktop and mobile, every time",
        short: "Every save captures desktop and mobile",
        blurb:
          "Each save is captured at 1440px and at 390px, so how a page reflows is part of the record rather than something you have to go and check.",
      },
      {
        Icon: Scroll,
        name: "The whole page, not the fold",
        short: "Full-page captures, not just the fold",
        blurb:
          "The capture scrolls the page first, so lazy-loaded sections have rendered before the screenshot is taken. Animations are frozen and cookie banners hidden.",
      },
      {
        Icon: History,
        name: "Re-capture without losing the old one",
        short: "Re-capture any time — earlier versions are kept",
        blurb:
          "Captures stack up on a timeline instead of replacing each other, so a redesign is something you can look back at rather than something you missed.",
      },
      {
        Icon: Archive,
        name: "A link to the archive",
        short: "Every capture links to its Wayback snapshot",
        blurb:
          "Each capture resolves the nearest snapshot on the Wayback Machine for that date, so you can dig into a version of the site rather than just look at it.",
      },
    ],
  },
  {
    title: "Reading the page",
    blurb: "What the page is, and what it's made of — written for you while the capture lands.",
    features: [
      {
        Icon: FileText,
        name: "A summary in plain words",
        short: "Every save is summarised for you",
        blurb:
          "A few sentences on what the page is for and how it's designed — the layout, the structure, the patterns worth noticing. Yours to edit or regenerate.",
      },
      {
        Icon: Tags,
        name: "Tagged four ways",
        short: "Tags are written for you, then yours to edit",
        blurb:
          "Vertical, page type, block/pattern and aesthetic. Four different questions, so a search can cross them: fintech pricing pages with a comparison table.",
      },
      {
        Icon: LayoutList,
        name: "An inventory of the blocks",
        short: "Every section on the page gets named",
        blurb:
          "Not just “hero” and “footer”, which every site has. A type-led hero, a mega footer, a tab block, an accordion — named as varieties so they're worth searching for.",
      },
      {
        Icon: Compass,
        name: "The pages that matter",
        short: "Kivli finds a site's key pages for you",
        blurb:
          "The site's own links, curated down to the pages that stand for its distinct templates, ranked primary to tertiary and named by function rather than by subject.",
      },
    ],
  },
  {
    title: "Colour and type",
    blurb: "Measured in a real browser, from the interface itself.",
    features: [
      {
        Icon: Palette,
        name: "A palette weighted by what you see",
        short: "Palettes measured by area, not guessed",
        blurb:
          "Every colour weighted by how much of the interface it actually covers. Photography is excluded on purpose — a palette taken from the pixels reports the hero shot, not the design.",
      },
      {
        Icon: Type,
        name: "Typefaces, with a real specimen",
        short: "See a site's real typefaces, drawn from the page",
        blurb:
          "Headline and body, identified from what actually rendered. The specimen is drawn off the live site by the browser, so you're looking at the real letterforms.",
      },
      {
        Icon: Link2,
        name: "Foundry and nearest match",
        short: "Every typeface links to its foundry",
        blurb:
          "Who drew it and where to license it, plus the closest thing on Google Fonts and Adobe Fonts. Every link is checked before it's shown, so none of them 404.",
      },
      {
        Icon: GitCompare,
        name: "Style history",
        short: "A site's old palette is kept when it changes",
        blurb:
          "Each reading keeps the one it replaced, so when a site changes its type or its palette, the previous one is still there to compare against.",
      },
    ],
  },
  {
    title: "Finding it again",
    blurb: "The whole point. Five seconds, not five minutes.",
    features: [
      {
        Icon: Search,
        name: "Search everything at once",
        short: "Search summaries, notes and tags at once",
        blurb:
          "One box across summaries, notes and tags — so a half-remembered phrase from a summary finds the site as readily as its name does.",
      },
      {
        Icon: SlidersHorizontal,
        name: "Filter by tag",
        short: "Stack tag filters to narrow a search",
        blurb:
          "Tags within one facet widen the search; tags across facets narrow it. Ecommerce or hospitality, and dark, and a bento grid.",
      },
      {
        Icon: LayoutGrid,
        name: "Three views, three card sizes",
        short: "Cards, list or headlines — at three sizes",
        blurb:
          "Browse as cards when you want to look, as a list when you want to read, as headlines when you want to scan. It remembers which you chose.",
      },
      {
        Icon: Sparkles,
        name: "Related saves",
        short: "Every save suggests the closest others",
        blurb:
          "Closest matches by shared tags, then by wording in common — so one site leads to the others in your library that were solving the same problem.",
      },
      {
        Icon: FolderOpen,
        name: "Collections",
        short: "Group saves into collections for a project",
        blurb:
          "Group saves for a pitch, a project or a mood. A save can sit in as many collections as it needs to.",
      },
      {
        Icon: EyeOff,
        name: "Favourites, and hiding",
        short: "Star what matters, hide what clutters",
        blurb:
          "Star the ones you keep coming back to. Hide the ones cluttering the dashboard — hidden saves stay in the library and still turn up in search.",
      },
    ],
  },
  {
    title: "Making it yours",
    blurb: "The AI writes a first draft. You have the last word on all of it.",
    features: [
      {
        Icon: Crop,
        name: "Crop a component",
        short: "Crop a single component out of any page",
        blurb:
          "Draw a box around one section — a pricing table, a nav, a footer — and keep it as its own record, tagged and searchable. The original capture is never touched.",
      },
      {
        Icon: ListChecks,
        name: "A review queue",
        short: "Everything the AI writes waits for your review",
        blurb:
          "Everything written for you lands here until you've read it, so nothing is quietly wrong in your library without you having had the chance to see it.",
      },
      {
        Icon: Tag,
        name: "Your vocabulary, not a fixed one",
        short: "Rename or merge tags — the AI follows",
        blurb:
          "Rename, merge or delete tags and the next AI pass uses your words. Tags it proposes wait for approval, which is what stops minimal, minimalist and clean-minimal all existing at once.",
      },
      {
        Icon: PenLine,
        name: "Notes in your own words",
        short: "Add your own notes to any save",
        blurb:
          "Why you saved it, what you'd steal, what the client thought. Notes are searched alongside everything else.",
      },
    ],
  },
];

// Flat, for the rotator.
export const FEATURES = FEATURE_GROUPS.flatMap((group) => group.features);
