// What each token is for. The values come from the stylesheets; only the words
// are kept here, and a token with no words shows up as not described.
export const TOKEN_GROUPS = [
  {
    name: "Surfaces",
    note: "What things sit on, from the page up.",
    tokens: {
      "--bg": "The page",
      "--surface": "Cards, dialogs, panels, the bar",
      "--surface-soft": "The hover grey, by an older name",
      "--surface-sunken": "Wells and tracks",
      "--surface-hover": "A row or button under the pointer",
      "--stage": "Behind a screenshot",
      "--overlay": "Behind a dialog",
    },
  },
  {
    name: "Fills",
    note: "Filled controls and chips.",
    tokens: {
      "--field-bg": "Search, filled buttons, the held tab",
      "--chip-bg": "The field grey, by an older name",
      "--chip-strong-bg": "A chip or button on a surface, the held group",
      "--seg-active": "The held option in a switch",
    },
  },
  {
    name: "Borders",
    note: "Lines, quietest first.",
    tokens: {
      "--hairline": "The faintest edge",
      "--border-soft": "Card and panel edges",
      "--border": "Dividers and fields",
      "--border-strong": "Control edges",
      "--border-strong-hover": "Control edges under the pointer",
      "--ring": "Keyboard focus",
      "--edge-shadow": "The line under the bar",
    },
  },
  {
    name: "Text",
    note: "Strongest first. Each should clear 4.5 on the page and on a card.",
    tokens: {
      "--text": "Titles and controls",
      "--text-body": "Main text, by an older name",
      "--text-secondary": "Supporting copy",
      "--text-muted": "Labels",
      "--text-faint": "Muted text, by an older name",
    },
  },
  {
    name: "Brand",
    note: "Orange is for one thing on a screen. Ink is the wordmark.",
    tokens: {
      "--accent": "Marks: the dot, the sparkle, a drop target",
      "--accent-hover": "The mark under the pointer",
      "--accent-solid": "The main button",
      "--accent-solid-hover": "The main button under the pointer",
      "--accent-solid-text": "Words on the main button",
      "--accent-text": "Words on the accent",
      "--brand-ink": "The wordmark, the headline, the search circle",
      "--ramp-deep": "Progress, first stop",
      "--ramp-mid": "Progress, second stop",
      "--ramp-warm": "Progress, third stop",
      "--ramp-lit": "Progress, lit end",
    },
  },
  {
    name: "Inverted",
    note: "Solid dark in light, solid light in dark.",
    tokens: {
      "--invert-bg": "Solid neutral buttons, selected chips",
      "--invert-bg-hover": "The same under the pointer",
      "--invert-text": "Words on them",
      "--tip-bg": "Tooltips",
      "--tip-text": "Words in a tooltip",
      "--letter-text": "A badge with no icon",
    },
  },
  {
    name: "Status",
    note: "Red destroys, amber waits for you, green is done.",
    tokens: {
      "--danger": "Destructive words, errors",
      "--danger-bg": "Destructive buttons",
      "--danger-bg-hover": "The same under the pointer",
      "--danger-border": "Their edge",
      "--warn-bg": "Waiting for review",
      "--warn-bg-hover": "The same under the pointer",
      "--warn-text": "Words on amber",
      "--ok-bg": "Done",
      "--ok-border": "Its edge",
      "--ok-text": "Words on green",
    },
  },
];

// Words on fills, and what they need: [text, on, for].
export const PAIRS = [
  ["--text", "--bg"],
  ["--text-body", "--surface"],
  ["--text-secondary", "--surface"],
  ["--text-muted", "--bg"],
  ["--text-muted", "--surface"],
  ["--text-muted", "--chip-bg"],
  ["--text-faint", "--bg"],
  ["--text-faint", "--surface"],
  ["--text-faint", "--chip-bg"],
  ["--accent-solid-text", "--accent-solid"],
  ["--invert-text", "--invert-bg"],
  ["--danger", "--surface"],
  ["--danger", "--danger-bg"],
  ["--warn-text", "--warn-bg"],
  ["--ok-text", "--ok-bg"],
  ["--tip-text", "--tip-bg"],
  ["--brand-ink", "--bg"],
  ["--accent", "--surface", "mark"],
  ["--border-strong", "--surface", "edge"],
];

// Text by the job it does. `selectors` is where the app sets it, which is what
// an edit reaches; `sample` is drawn with those real classes and measured.
// `as` is the proposed name, and several of today's styles share one.
export const TYPE_ROLES = [
  {
    id: "display",
    as: "Display",
    name: "Dashboard headline",
    selectors: ".page-hero",
    sample: (t) => <h2 className="page-hero" {...t}>Save any website</h2>,
  },
  {
    id: "record",
    as: "Title",
    name: "A site’s own name",
    selectors: ".name-input, .shared-detail-title",
    sample: (t) => <h1 className="shared-detail-title" {...t}>Ramp</h1>,
  },
  {
    id: "page",
    as: "Title",
    name: "Page title",
    selectors: ".page > h1, .top-nav h1, .collection-title",
    sample: (t) => (
      <div className="top-nav">
        <h1 {...t}>Review Queue</h1>
      </div>
    ),
  },
  {
    id: "panel",
    as: "Heading",
    name: "Panel heading",
    selectors: ".tag-panel-head h2",
    sample: (t) => (
      <div className="tag-panel-head">
        <h2 {...t}>Block / Pattern</h2>
      </div>
    ),
  },
  {
    id: "band",
    as: "Heading",
    name: "Band heading",
    selectors: ".page-band > h2",
    sample: (t) => (
      <div className="page-band">
        <h2 {...t}>More like this</h2>
      </div>
    ),
  },
  {
    id: "dialog",
    as: "Subheading",
    name: "Dialog title",
    selectors: ".modal-head h2",
    sample: (t) => (
      <div className="modal-head">
        <h2 {...t}>New group</h2>
      </div>
    ),
  },
  {
    id: "side",
    as: "Small",
    name: "Side panel heading",
    selectors: ".detail-section h2",
    sample: (t) => (
      <div className="detail-section">
        <h2 {...t}>Tags</h2>
      </div>
    ),
  },
  {
    id: "section",
    as: "Small",
    name: "List heading",
    selectors: ".tag-section h2",
    sample: (t) => (
      <div className="tag-section">
        <h2 {...t}>New from the AI</h2>
      </div>
    ),
  },
  {
    id: "lead",
    as: "Lead",
    name: "Page introduction",
    selectors: ".tag-page-note",
    sample: (t) => <p className="tag-page-note" {...t}>Tags appear as you save things.</p>,
  },
  {
    id: "body",
    as: "Body",
    name: "Dialog copy",
    selectors: ".tag-dialog-note",
    sample: (t) => <p className="tag-dialog-note" {...t}>Nothing is deleted. Its tags stay on everything they’re on.</p>,
  },
  {
    id: "summary",
    as: "Body",
    name: "A summary",
    selectors: ".summary-text",
    sample: (t) => (
      <div className="detail-section">
        <p className="summary-text" {...t}>An open-source icon set, drawn on a 24px grid.</p>
      </div>
    ),
  },
  {
    id: "control",
    as: "Control",
    name: "Button label",
    selectors: ".modal-foot button",
    sample: (t) => (
      <div className="modal-foot">
        <button {...t}>Cancel</button>
      </div>
    ),
  },
  {
    id: "card",
    as: "Control",
    name: "Card title",
    selectors: ".card .name",
    sample: (t) => (
      <div className="card" style={{ padding: 12 }}>
        <span className="card-title">
          <a className="name" {...t}>Superhuman</a>
        </span>
      </div>
    ),
  },
  {
    id: "field",
    as: "Caption",
    name: "Field label",
    selectors: ".field > span",
    sample: (t) => (
      <label className="field">
        <span {...t}>Name</span>
      </label>
    ),
  },
  {
    id: "hint",
    as: "Caption",
    name: "Field hint",
    selectors: ".field-hint",
    sample: (t) => <small className="field-hint" {...t}>You can add more any time.</small>,
  },
  {
    id: "chip",
    as: "Caption",
    name: "Chip",
    selectors: ".card-tags .chip",
    sample: (t) => (
      <div className="card-tags">
        <span className="chip" {...t}>Editorial</span>
      </div>
    ),
  },
];

// The scale, largest first. Sizes come from the stylesheet. Two steps have no
// size yet because nothing in the app needs them.
export const TYPE_SCALE = [
  { token: "--type-display", name: "Display", weight: 800, family: "Figtree", job: "The dashboard headline" },
  { token: "--type-title", name: "Title", weight: 800, family: "Figtree", job: "A page or a record" },
  { token: "--type-heading", name: "Heading", weight: 800, family: "Figtree", job: "A panel, or a section of a page" },
  { token: "--type-subheading", name: "Subheading", weight: 700, family: "System", job: "A dialog, a group of steps" },
  { token: "--type-lead", name: "Lead", weight: 400, family: "System", job: "The line under a page’s title" },
  { token: "--type-body", name: "Body", weight: 400, family: "System", job: "Copy, the name of a save" },
  { token: "--type-control", name: "Control", weight: 500, family: "System", job: "Buttons, fields, dialog copy" },
  { token: "--type-small", name: "Small", weight: 500, family: "System", job: "Chips, panel labels, supporting copy" },
  { token: "--type-caption", name: "Caption", weight: 400, family: "System", job: "Hints, counts, dates" },
  { name: "Overline", weight: 600, family: "System", job: "A label above a heading" },
  { name: "Code", weight: 400, family: "Mono", job: "A value to copy" },
];
export const PROPOSED_SPACE = [2, 4, 8, 12, 16, 20, 24, 32, 40, 64];
export const PROPOSED_RADIUS = [6, 10, 14, 20, 999];
