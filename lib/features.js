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
// `short` is written to be read in four seconds and on its own. Every `name`
// is short enough to hold one line in a card, and every `blurb` is written to
// the same length, so a grid of them comes out even rather than ragged.
export const FEATURE_GROUPS = [
  {
    title: "Saving",
    blurb:
      "Paste a URL. Everything below happens on its own while you get on with something else.",
    features: [
      {
        Icon: Monitor,
        name: "Desktop and mobile",
        short: "Every save captures desktop and mobile",
        blurb:
          "Each save is photographed at 1440px and at 390px, so how a page reflows is part of the record.",
      },
      {
        Icon: Scroll,
        name: "The whole page",
        short: "Full-page captures, not just the fold",
        blurb:
          "The page is scrolled first so lazy sections load, animations freeze and cookie banners hide.",
      },
      {
        Icon: History,
        name: "Re-capture any time",
        short: "Re-capture any time, earlier versions are kept",
        blurb:
          "Captures stack on a timeline instead of replacing each other, so a redesign stays visible.",
      },
      {
        Icon: Archive,
        name: "A link to the archive",
        short: "Every capture links to its Wayback snapshot",
        blurb:
          "Each capture resolves the nearest Wayback Machine snapshot, so you can open the live version.",
      },
    ],
  },
  {
    title: "Reading the page",
    blurb:
      "What the page is and what it is made of, written for you while the capture lands.",
    features: [
      {
        Icon: FileText,
        name: "Written summaries",
        short: "Every save is summarised for you",
        blurb:
          "A few sentences on what the page is for and how it is built, yours to edit or regenerate.",
      },
      {
        Icon: Tags,
        name: "Tagged four ways",
        short: "Tags are written for you, then yours to edit",
        blurb:
          "Vertical, page type, block and aesthetic. Four questions, so one search can cross all four.",
      },
      {
        Icon: LayoutList,
        name: "Every block named",
        short: "Every section on the page gets named",
        blurb:
          "Not just hero and footer. A type-led hero, a mega footer, a tab block, an accordion, by name.",
      },
      {
        Icon: Compass,
        name: "The pages that matter",
        short: "Kivli finds a site's key pages for you",
        blurb:
          "A site's links, curated to the pages standing for its templates and named by what they do.",
      },
    ],
  },
  {
    title: "Colour and type",
    blurb:
      "Measured in a real browser, off the interface itself rather than out of a stylesheet.",
    features: [
      {
        Icon: Palette,
        name: "A measured palette",
        short: "Palettes measured by area, not guessed",
        blurb:
          "Every colour weighted by the area it covers. Photography is excluded, so you get the design.",
      },
      {
        Icon: Type,
        name: "Real type specimens",
        short: "See a site's real typefaces, drawn from the page",
        blurb:
          "Headline and body, identified from what rendered, with letterforms drawn off the live page.",
      },
      {
        Icon: Link2,
        name: "Foundry and matches",
        short: "Every typeface links to its foundry",
        blurb:
          "Who drew it and where to license it, plus the closest Google and Adobe faces, each checked.",
      },
      {
        Icon: GitCompare,
        name: "Style history",
        short: "A site's old palette is kept when it changes",
        blurb:
          "Every reading keeps the one before it, so a change of type or colour is there to compare.",
      },
    ],
  },
  {
    title: "Finding it again",
    blurb:
      "The whole point of the thing. Five seconds later, not five minutes later.",
    features: [
      {
        Icon: Search,
        name: "Search everything",
        short: "Search summaries, notes and tags at once",
        blurb:
          "One box across summaries, notes, tags and names, so a half-remembered phrase is enough.",
      },
      {
        Icon: SlidersHorizontal,
        name: "Stackable filters",
        short: "Stack tag filters to narrow a search",
        blurb:
          "Tags inside one facet widen the search and tags across facets narrow it, as deep as you like.",
      },
      {
        Icon: LayoutGrid,
        name: "Three ways to browse",
        short: "Cards, list or headlines, at three sizes",
        blurb:
          "Cards to look, a list to read, headlines to scan, at three sizes. It remembers your choice.",
      },
      {
        Icon: Sparkles,
        name: "Related saves",
        short: "Every save suggests the closest others",
        blurb:
          "Closest matches by shared tags then by wording, so one save leads to the rest like it.",
      },
      {
        Icon: FolderOpen,
        name: "Collections",
        short: "Group saves into collections for a project",
        blurb:
          "Group saves for a pitch, a project or a mood, and put one save in as many as it belongs in.",
      },
      {
        Icon: EyeOff,
        name: "Favourites and hiding",
        short: "Star what matters, hide what clutters",
        blurb:
          "Star what you return to. Hide the rest from the dashboard, still in the library and search.",
      },
    ],
  },
  {
    title: "Making it yours",
    blurb:
      "The AI writes a first draft of everything. You have the last word on all of it.",
    features: [
      {
        Icon: Crop,
        name: "Crop a component",
        short: "Crop a single component out of any page",
        blurb:
          "Draw a box around one section and keep it as its own record. The capture is never altered.",
      },
      {
        Icon: ListChecks,
        name: "A review queue",
        short: "Everything the AI writes waits for review",
        blurb:
          "Everything written for you waits here until read, so nothing sits quietly wrong for months.",
      },
      {
        Icon: Tag,
        name: "Your own vocabulary",
        short: "Rename or merge tags and the AI follows",
        blurb:
          "Rename, merge or delete tags and the next pass uses your words. New ones wait for approval.",
      },
      {
        Icon: PenLine,
        name: "Notes in your words",
        short: "Add your own notes to any save",
        blurb:
          "Why you saved it, what you would steal, what the client said. Notes are searched with the rest.",
      },
    ],
  },
];

// Flat, for the rotator.
export const FEATURES = FEATURE_GROUPS.flatMap((group) => group.features);
