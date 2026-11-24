import {
  Bookmark,
  Compass,
  Copy,
  Crop,
  Expand,
  Eye,
  FileText,
  Film,
  FolderOpen,
  Folders,
  History,
  Images,
  Import,
  LayoutList,
  ListChecks,
  Monitor,
  Palette,
  Plug,
  Puzzle,
  ScanSearch,
  Scissors,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Tags,
  Type,
  Upload,
  Video,
} from "lucide-react";

// Everything Kivli does, in one list.
//
// Data rather than a component, so the two places that show features can't
// drift apart: the rotator picks a line at random while you wait for a
// capture, and /features lays the whole set out. Adding something here puts it
// in both.
//
// Ordered by what you are saving. The first four groups are the four kinds and
// hold only what is particular to each. Everything else works on more than
// one, and is grouped by what it is for. Grouping the whole page by kind was
// the obvious idea and doesn't work: more than half of what Kivli does belongs
// to no one kind, so it would be said four times or not at all.
//
// Keep an even number in a group: the page sets cards two across, and an odd
// one leaves a hole beside it.
//
// `short` is the rotator's line, read in four seconds and on its own; `also`
// is more of them, for a card that covers more than one thing. Every `name`
// is short enough to hold one line in a card, and the blurbs are of a length,
// so a grid of them comes out even rather than ragged.
//
// Say only what is true of every kind a card claims. "Everything the AI writes
// waits for review" stayed here after visuals arrived, which aren't queued.
export const FEATURE_GROUPS = [
  {
    id: "websites",
    title: "Websites",
    blurb: "A page photographed in full, then read: what it is made of, what colours it paints and what it is set in.",
    features: [
      {
        Icon: Monitor,
        name: "Desktop and mobile",
        short: "Every website is captured on desktop and mobile",
        also: ["Full-page captures, not just the fold"],
        blurb: "The full page at 1440px and at 390px, scrolled first so lazy sections load and banners hide.",
      },
      {
        Icon: History,
        name: "Nothing overwritten",
        short: "Re-capture any time, earlier versions are kept",
        also: ["Every capture links to its Wayback snapshot","A site's old palette is kept when it changes"],
        blurb: "Captures and style readings stack, so a redesign stays visible. Each links to the Wayback Machine.",
      },
      {
        Icon: LayoutList,
        name: "Every block named",
        short: "Every section on the page gets named",
        blurb: "Not just hero and footer. A type-led hero, a mega footer, a tab block, an accordion, by name.",
      },
      {
        Icon: Compass,
        name: "The pages that matter",
        short: "Kivli finds a site's key pages for you",
        blurb: "A site's links, curated to the pages standing for its templates and named by what they do.",
      },
      {
        Icon: Palette,
        name: "A measured palette",
        short: "Palettes measured by area, not guessed",
        blurb: "Every colour weighted by the area it covers. Photography is excluded, so you get the design.",
      },
      {
        Icon: Type,
        name: "Typefaces identified",
        short: "See a site's real typefaces, drawn from the page",
        also: ["Every typeface links to its foundry"],
        blurb: "Letterforms drawn off the live page, with the foundry and nearest matches, each link checked.",
      },
    ],
  },
  {
    id: "components",
    title: "Components",
    blurb: "For when the pricing table is the reason you saved it and the rest of the page is not.",
    features: [
      {
        Icon: Crop,
        name: "Crop any region",
        short: "Crop a single component out of any page",
        blurb: "Draw a box around one section and keep it as its own record, on desktop and on mobile.",
      },
      {
        Icon: Scissors,
        name: "Re-crop any time",
        short: "Re-crop a component whenever you like",
        blurb: "The original capture is never altered, so anything you cropped out is still there to bring back.",
      },
    ],
  },
  {
    id: "visuals",
    title: "Visuals",
    blurb: "A studio's case study is mostly pictures of the work. Keep the pictures and leave the page.",
    features: [
      {
        Icon: Images,
        name: "Pick the images",
        short: "Save the images from any case study page",
        also: ["Save a LinkedIn or X post, credited to its author"],
        blurb: "Paste a project page, or a LinkedIn or X post, and pick what to keep. Each is its own card, credited.",
      },
      {
        Icon: Film,
        name: "Loops, not stills",
        short: "Keep a case study's looping videos as loops",
        blurb: "Videos on a project page are offered beside its images and kept as muted loops, up to 15 MB each.",
      },
      {
        Icon: ScanSearch,
        name: "Described one by one",
        short: "Every saved image is described and tagged",
        blurb: "Medium, aesthetic and industry for each image, plus a paragraph on the project it came from.",
      },
      {
        Icon: Expand,
        name: "A board, full screen",
        short: "Open any image full screen and step through",
        blurb: "Every image you kept on one board, opened full screen and walked with the arrow keys.",
      },
    ],
  },
  {
    id: "resources",
    title: "Resources",
    blurb: "Icon sets, type foundries, articles and tools. There is nothing to photograph, so nothing is.",
    features: [
      {
        Icon: Bookmark,
        name: "Saved for what it does",
        short: "Save a tool or a link, not only a page",
        blurb: "An icon set, a stock library, an AI tool. Described and filed in about eight seconds.",
      },
      {
        Icon: Folders,
        name: "Folders fill themselves",
        short: "Resources are filed into folders for you",
        blurb: "Every resource is sorted on the way in, and one that belongs in two folders can sit in both.",
      },
    ],
  },
  {
    id: "in",
    title: "Getting things in",
    blurb: "A pasted link is the usual way. These are for when you are on the page, have no link, or have a hundred.",
    features: [
      {
        Icon: Puzzle,
        name: "From any page",
        short: "Save the page you're on from a Chrome button",
        also: ["Pick images straight off the page you're on", "Grab a component straight off your screen"],
        blurb: "A button in Chrome saves the page you are on, picks images off it, or grabs what you can see.",
      },
      {
        Icon: Upload,
        name: "Your own files",
        short: "Drop in screenshots that don't live online",
        blurb: "Drop in images that never lived on a page, as components or visuals. Each one is described.",
      },
      {
        Icon: Video,
        name: "Screen recordings",
        short: "Upload a screen recording and keep it looping",
        blurb: "MP4 and MOV clips up to 25 MB, kept whole with the sound taken out, and looping when opened.",
      },
      {
        Icon: Import,
        name: "Bring your bookmarks",
        short: "Import a whole bookmarking app in one paste",
        blurb: "Paste a list or drop an export, as any of the four. Kivli works through it in the background.",
      },
    ],
  },
  {
    id: "filed",
    title: "Filed for you",
    blurb: "The AI writes a first draft of everything. You have the last word on all of it.",
    features: [
      {
        Icon: FileText,
        name: "Written summaries",
        short: "Every save is summarised for you",
        also: ["Add your own notes to any save"],
        blurb: "What it is and what makes it worth keeping, yours to edit, with your own notes beside it.",
      },
      {
        Icon: Tags,
        name: "Tagged to be found",
        short: "Tags are written for you, then yours to edit",
        blurb: "Each kind is tagged by its own questions, from your own list of words, so one idea gets one word.",
      },
      {
        Icon: ListChecks,
        name: "A review queue",
        short: "See what the AI wrote before you rely on it",
        blurb: "Websites, components and resources wait here until you have looked, so nothing sits quietly wrong.",
      },
      {
        Icon: Tag,
        name: "Your own vocabulary",
        short: "Rename or merge tags and the AI follows",
        blurb: "Rename, merge or delete tags and the next pass uses your words. New ones wait for approval.",
      },
    ],
  },
  {
    id: "find",
    title: "Find it again",
    blurb: "The whole point of the thing. Five seconds later, not five minutes later.",
    features: [
      {
        Icon: Search,
        name: "Search everything",
        short: "Search summaries, notes and tags at once",
        also: ["Found nothing? Kivli checks your other tabs"],
        blurb: "One box for half-remembered phrases. If it is under another tab, Kivli says so and takes you there.",
      },
      {
        Icon: SlidersHorizontal,
        name: "Filters that stack",
        short: "Stack tag filters to narrow a search",
        also: ["Cards, list or headlines, at three sizes"],
        blurb: "Tags in one group widen the search and groups narrow it together, as deep as you like.",
      },
      {
        Icon: Sparkles,
        name: "Related saves",
        short: "Every save suggests the closest others",
        blurb: "Closest matches by shared tags and then by wording, so one save leads to the rest like it.",
      },
      {
        Icon: FolderOpen,
        name: "Collections and stars",
        short: "Group saves into collections for a project",
        also: ["Star what matters, hide what clutters"],
        blurb: "Group all four kinds for a pitch or a project. Star what you return to and hide sites that clutter.",
      },
    ],
  },
  {
    id: "use",
    title: "Use it anywhere",
    blurb: "A library is only worth keeping if it is there when the work is happening somewhere else.",
    features: [
      {
        Icon: Plug,
        name: "Connect your AI",
        short: "Ask Claude or ChatGPT to search your library",
        also: ["Tell your AI to save what you found"],
        blurb: "Claude, ChatGPT or any MCP app can search your saves, open screenshots and save what it finds.",
      },
      {
        Icon: Copy,
        name: "Export for AI",
        short: "Copy any save or collection into your AI",
        blurb: "Copy or download a save or a whole collection for any AI, marked with what was measured.",
      },
      {
        Icon: Share2,
        name: "Share what you mean to",
        short: "Share one tab, collection or folder",
        also: ["Share your library with a link"],
        blurb: "A link anyone can open, to everything, one tab, a collection or a single folder. No sign-in.",
      },
      {
        Icon: Eye,
        name: "Yours stays yours",
        short: "Revoke any share link on its own",
        also: ["A share shows the saves and nothing else"],
        blurb: "Notes, review flags and hidden saves stay behind, and revoking one link leaves the rest working.",
      },
    ],
  },
];

// Flat, for the rotator: one entry per line it can show.
export const FEATURES = FEATURE_GROUPS.flatMap((group) =>
  group.features.flatMap((feature) => [feature.short, ...(feature.also || [])].map((short) => ({ ...feature, short })))
);
