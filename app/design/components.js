import {
  ArrowDownUp, ArrowUpRight, Bookmark, Check, Grid3x3, Heart, LayoutGrid, List, MoreHorizontal, Pencil, Plus, Search,
  SlidersHorizontal, Square, Trash2, X,
} from "./componentIcons";
import Wordmark from "../_ui/Wordmark";

// Every part the app is made of, drawn with its real classes inside the
// container that styles it. `t(base)` gives the part its class and whichever
// state is being shown; the page compares each state with rest, and one that
// looks the same is marked as a gap. The state itself comes second, for the few
// whose words change with it.

const BUTTON = ["rest", "hover", "focus", "active", "disabled"];
const WORKS = [...BUTTON, "busy"];
const LINK = ["rest", "hover", "focus", "active"];
const FIELD = ["rest", "hover", "focus", "disabled"];

export const COMPONENTS = [
  {
    id: "buttons",
    name: "Buttons",
    note: "One orange button on a screen. Everything else is grey, outlined, inverted or a word.",
    items: [
      { name: "Add", note: "The one action the app exists for", states: BUTTON, render: (t) => <button {...t("add-btn")}><Plus size={16} /> Add</button> },
      { name: "Primary", note: "The answer in a dialog", states: WORKS, render: (t, s) => <div className="modal-foot ds-bare"><button {...t("modal-apply")}>{s === "busy" ? "Saving…" : "Save"}</button></div> },
      { name: "Secondary", note: "The other answer", states: BUTTON, render: (t) => <div className="modal-foot ds-bare"><button {...t("")}>Cancel</button></div> },
      { name: "Destructive", note: "What can’t be undone", states: WORKS, render: (t, s) => <div className="modal-foot ds-bare"><button {...t("danger-btn")}>{s === "busy" ? "Deleting…" : "Delete"}</button></div> },
      { name: "Inverted", note: "Solid, without spending the orange", states: WORKS, render: (t, s) => <div className="bulk-actions"><button {...t("primary")}>{s === "busy" ? "Working…" : "Approve"}</button></div> },
      { name: "Page action", note: "Beside a record’s name", states: WORKS, render: (t, s) => <div className="detail-actions"><button {...t("")}>{s === "busy" ? "Re-capturing…" : "Re-capture"}</button></div> },
      { name: "Visit", note: "Out to the real site", states: LINK, render: (t) => <a {...t("visit-btn")} href="#buttons">Visit site <ArrowUpRight size={15} /></a> },
      { name: "Small", note: "In a row or a panel’s head", states: BUTTON, render: (t) => <div className="tag-panel-title"><div className="tag-actions"><button {...t("")}><Pencil size={14} /> Edit</button></div></div> },
      { name: "Outline", note: "A quiet way to add", states: BUTTON, render: (t) => <div className="ds-narrow"><button {...t("tag-rail-new")}><Plus size={15} /> New Group</button></div> },
      { name: "Filters", states: BUTTON, render: (t) => <button {...t("filters-btn")}><SlidersHorizontal size={15} /> Filters</button> },
      { name: "Sort", states: BUTTON, render: (t) => <button {...t("sort-btn")}><ArrowDownUp size={14} /> Newest First</button> },
      { name: "Load more", states: BUTTON, render: (t) => <div className="load-more-row"><button {...t("load-more")}>Load More</button></div> },
      { name: "Icon", note: "32px. Always with a tooltip", states: BUTTON, render: (t) => <button {...t("icon-btn")} aria-label="More"><MoreHorizontal size={16} /></button> },
      { name: "Word", note: "An action that isn’t a button", states: WORKS, render: (t, s) => <button {...t("link-btn")}>{s === "busy" ? "Regenerating…" : "Regenerate"}</button> },
    ],
  },
  {
    id: "fields",
    name: "Fields",
    note: "A field says what it is with a fill, and where you are with a ring.",
    items: [
      { name: "Search", states: ["rest", "hover", "focus"], render: (t) => (
        <div className="search-field ds-wide"><input {...t("search-input")} type="search" placeholder="Search name, summary, tags…" readOnly /><button className="search-go" tabIndex={-1} aria-label="Search"><Search size={17} /></button></div>
      ) },
      { name: "Text", states: FIELD, render: (t) => <label className="field ds-wide"><span>Name</span><input {...t("")} placeholder="Platform" readOnly /></label> },
      { name: "Text, filled in", states: ["rest"], render: (t) => <label className="field ds-wide"><span>Name</span><input {...t("")} value="Platform" readOnly /></label> },
      { name: "Text, wrong", note: "The sentence says what, the edge says where", states: ["rest", "focus"], render: (t) => <div className="ds-wide"><p className="error">Give the group a name.</p><label className="field"><span>Name</span><input {...t("")} aria-invalid="true" placeholder="Platform" readOnly /></label></div> },
      { name: "Long text", states: FIELD, render: (t) => <label className="field ds-wide"><span>Notes</span><textarea {...t("")} rows={2} placeholder="What you want to remember" readOnly /></label> },
      { name: "Tags", states: ["rest", "hover", "focus"], render: (t) => (
        <div className="combobox ds-wide"><div {...t("combobox-field")}><span className="combobox-chip">Editorial<button tabIndex={-1} aria-label="Remove">×</button></span><span className="combobox-chip chip-pending">Reference<button tabIndex={-1} aria-label="Remove">×</button></span><input placeholder="Add tags…" readOnly tabIndex={-1} /></div></div>
      ) },
      { name: "Tick", note: "One, wherever a list can be picked from", states: ["rest", "hover", "focus", "disabled"], render: (t) => <input {...t("select-box")} type="checkbox" readOnly /> },
      { name: "Tick, on", states: ["rest", "disabled"], render: (t) => <input {...t("select-box")} type="checkbox" checked readOnly /> },
      { name: "Drop box", note: "Files", states: ["rest", "hover"], render: (t) => <div {...t("drop-box ds-wide")}>Drop images or clips here</div> },
      { name: "Select", note: "Only on Invites", states: FIELD, render: (t) => <form className="save-form invite-form ds-wide"><select {...t("")}><option>1 code</option></select></form> },
      { name: "One-line form", note: "A new collection, a new invite", states: FIELD, render: (t) => <form className="save-form ds-wide"><input {...t("")} placeholder="Name a collection" readOnly /></form> },
      { name: "Add’s address", states: FIELD, render: (t) => <div className="add-pop-form ds-wide"><input {...t("")} placeholder="https://" defaultValue="" /></div> },
    ],
  },
  {
    id: "choices",
    name: "Choices",
    note: "Sets of options where one is held, and chips where several can be.",
    items: [
      { name: "Tabs", note: "The app’s top level", states: LINK, render: (t) => <div className="tab-switcher"><button {...t("")}><span className="tab-label" data-label="Visuals">Visuals</span></button></div> },
      { name: "Tab, held", note: "Pressing it does nothing, so it doesn’t answer the pointer", states: ["rest"], render: (t) => <div className="tab-switcher"><button {...t("active")}><span className="tab-label" data-label="Websites">Websites</span></button></div> },
      { name: "Switch", states: ["rest", "hover", "focus"], render: (t) => <div className="view-switch"><button className="active" tabIndex={-1}><LayoutGrid size={15} /><span>Cards</span></button><button {...t("")}><List size={15} /><span>List</span></button></div> },
      { name: "Size switch", states: ["rest", "hover", "focus"], render: (t) => <div className="size-switch"><button {...t("")} aria-label="Small"><Grid3x3 size={15} /></button><button className="active" tabIndex={-1} aria-label="Medium"><LayoutGrid size={15} /></button><button tabIndex={-1} aria-label="Large"><Square size={15} /></button></div> },
      { name: "Filter chip", states: LINK, render: (t) => <div className="chip-strip ds-bare"><button {...t("chip chip-filter")}>Editorial<span className="chip-count">21</span></button></div> },
      { name: "Filter chip, on", states: ["rest", "hover", "focus"], render: (t) => <div className="chip-strip ds-bare"><button {...t("chip chip-filter chip-selected")}>Editorial<span className="chip-count">21</span></button></div> },
      { name: "Folder", states: LINK, render: (t) => <button {...t("folder")}>Icons<span className="folder-count">14</span></button> },
      { name: "Folder, open", states: ["rest", "hover"], render: (t) => <button {...t("folder folder-on")}>Icons<span className="folder-count">14</span></button> },
      { name: "Rail item", states: LINK, render: (t) => <div className="ds-narrow"><button {...t("tag-rail-item")}><span>Aesthetic</span><span className="tag-rail-count">10</span></button></div> },
      { name: "Rail item, held", states: ["rest", "hover"], render: (t) => <div className="ds-narrow"><button {...t("tag-rail-item active")}><span>Aesthetic</span><span className="tag-rail-count">10</span></button></div> },
      { name: "Filter option", states: ["rest", "hover"], render: (t) => <div className="modal-options ds-bare"><label {...t("")}><input type="checkbox" readOnly tabIndex={-1} /><span>Minimal</span><span className="modal-count">28</span></label></div> },
      { name: "Filter option, on", states: ["rest"], render: (t) => <div className="modal-options ds-bare"><label {...t("")}><input type="checkbox" checked readOnly tabIndex={-1} /><span>Minimal</span><span className="modal-count">28</span></label></div> },
    ],
  },
  {
    id: "tags",
    name: "Tags",
    note: "What a save wears, and the tile you tidy it with.",
    items: [
      { name: "Chip", states: ["rest"], render: (t) => <span {...t("chip")}>Editorial</span> },
      { name: "Chip, waiting", note: "The AI’s word, not yet yours", states: ["rest"], render: (t) => <span {...t("chip chip-pending")}>Reference</span> },
      { name: "Chip you can press", states: LINK, render: (t) => <div className="resource-tags"><button {...t("chip chip-filter")}>Icons</button></div> },
      { name: "Tile", states: LINK, render: (t) => <div className="ds-tile"><button {...t("tag-tile")}><span className="tag-tile-name">Agency</span><span className="tag-tile-count">12</span></button></div> },
      { name: "Tile, selected", states: ["rest", "hover"], render: (t) => <div className="ds-tile"><button {...t("tag-tile tag-tile-on")}><span className="tag-tile-name">Agency</span><span className="tag-tile-count">12</span></button></div> },
      { name: "Tile, not used yet", states: ["rest", "hover"], render: (t) => <div className="ds-tile"><button {...t("tag-tile tag-tile-unused")}><span className="tag-tile-name">Agency</span></button></div> },
      { name: "Tile, waiting", states: ["rest", "hover"], render: (t) => <div className="ds-tile"><button {...t("tag-tile tag-tile-pending")}><span className="tag-tile-name">Nonprofit</span><span className="tag-tile-count">1</span></button></div> },
      { name: "Tile, lifted", states: ["rest"], render: (t) => <div className="ds-tile"><button {...t("tag-tile tag-tile-lifted")}><span className="tag-tile-name">Agency</span><span className="tag-tile-count">12</span></button></div> },
      { name: "Tile, dropped on", states: ["rest"], render: (t) => <div className="ds-tile"><button {...t("tag-tile tag-tile-over")}><span className="tag-tile-name">SaaS</span><span className="tag-tile-count">38</span></button></div> },
      { name: "Tile, dragged", states: ["rest"], render: (t) => <div className="ds-tile"><div {...t("tag-ghost-tile")}><span className="tag-tile-name">Agency</span><span className="tag-tile-count">12</span></div></div> },
      { name: "Add a tile", states: LINK, render: (t) => <div className="ds-tile"><button {...t("tag-tile tag-tile-add")}><Plus size={15} /> Add Tag</button></div> },
    ],
  },
  {
    id: "cards",
    name: "Cards and rows",
    note: "The same save at four sizes.",
    items: [
      { name: "Card", states: ["rest", "hover"], wide: true, render: (t) => <div className="ds-card"><div {...t("card")}><div className="card-media"><span className="thumb"><span className="ds-shot" /></span></div><div className="card-footer"><span className="card-title"><span className="favicon-badge ds-badge" /><a className="name">Superhuman</a></span><span className="visit"><ArrowUpRight size={17} /></span></div><div className="card-tags"><span className="chip">SaaS</span><span className="chip">Editorial</span></div></div></div> },
      { name: "Card, capturing", states: ["rest"], wide: true, render: (t) => <div className="ds-card"><div {...t("card")}><div className="card-media"><span className="thumb"><span className="placeholder">Capturing…</span></span></div><div className="card-footer"><span className="card-title"><a className="name">attio.com</a></span></div></div></div> },
      { name: "Card, loading", states: ["rest"], wide: true, render: (t) => <div className="ds-card library-loading"><div {...t("card")}><div className="thumb" /><div className="card-footer"><span className="skeleton-disc" /><span className="skeleton-line" /></div></div></div> },
      { name: "List row", states: ["rest", "hover"], wide: true, render: (t) => <div className="ds-row"><div {...t("row-item")}><div className="row-thumb"><span className="ds-shot" /></div><div className="row-body"><span className="row-name">Superhuman</span><p className="row-summary">An email client, set in one column of confident type.</p><div className="card-tags"><span className="chip">SaaS</span></div></div></div></div> },
      { name: "Headline row", states: ["rest", "hover"], wide: true, render: (t) => <div className="ds-row"><div {...t("headline-item")}><span className="row-name">Superhuman</span></div></div> },
      { name: "Resource row", states: ["rest", "hover"], wide: true, render: (t) => <div className="ds-row"><div {...t("resource-row")}><div className="resource-body"><span className="resource-head"><a className="resource-title">Lucide</a><span className="resource-domain">lucide.dev</span></span><span className="resource-summary">An open-source icon set.</span></div></div></div> },
      { name: "Panel", states: ["rest"], wide: true, render: (t) => <div className="ds-row"><div {...t("tag-panel")}>A holding shape</div></div> },
    ],
  },
  {
    id: "feedback",
    name: "Feedback",
    note: "What the app says back.",
    items: [
      { name: "Error", states: ["rest"], wide: true, render: (t) => <p {...t("error ds-row")}>Couldn’t reach the server</p> },
      { name: "With a way back", states: ["rest"], wide: true, render: (t) => <div className="ds-row"><div {...t("tag-undo")}><span>Merged <strong>Minimalist</strong> into <strong>Minimal</strong>.</span><span className="tag-undo-actions"><button className="link-btn" tabIndex={-1}>Undo</button><button className="icon-btn" tabIndex={-1} aria-label="Close"><X size={16} /></button></span></div></div> },
      { name: "State of a panel", states: ["rest"], wide: true, render: (t) => <p {...t("tag-panel-state ds-row")}>Tagging what you already had: 32 of 209.</p> },
      { name: "Progress", states: ["rest"], wide: true, render: (t) => <div className="ds-row"><div {...t("capture-status")}><div className="capture-status-bar"><div className="capture-status-fill" style={{ width: "62%" }} /></div><div className="capture-status-row"><p>Capturing superhuman.com</p></div></div></div> },
      { name: "Progress, done", states: ["rest"], wide: true, render: (t) => <div className="ds-row"><div {...t("capture-status capture-status-done")}><p>✓ Superhuman is in your library.</p></div></div> },
      { name: "Progress, failed", states: ["rest"], wide: true, render: (t) => <div className="ds-row"><div {...t("capture-status capture-status-done capture-status-failed")}><p>That page couldn’t be captured.</p></div></div> },
      { name: "Tooltip", states: ["rest"], render: (t) => <div className="ds-tip"><div {...t("app-tip")}>Launch site</div></div> },
      { name: "Empty", states: ["rest"], wide: true, render: (t) => <div className="ds-row"><div {...t("empty-state")}><h2 className="empty-state-headline">Start your library.</h2><p className="empty-state-body">Paste any URL.</p></div></div> },
      { name: "Nothing found", states: ["rest"], wide: true, render: (t) => <div className="ds-row"><div {...t("empty-state empty-state-search")}><h2 className="empty-state-headline">No sites match “moss”.</h2><p className="empty-state-body">Try a different word.</p></div></div> },
    ],
  },
  {
    id: "layers",
    name: "Layers",
    note: "What opens over the page.",
    items: [
      { name: "Menu item", states: LINK, render: (t) => <div className="ds-menu"><a {...t("more-item")} href="#layers"><Heart size={15} /> Favorites</a></div> },
      { name: "Sort option", states: ["rest", "hover", "focus"], render: (t) => <div className="ds-menu"><button {...t("sort-option")}><span className="sort-check" />Oldest First</button></div> },
      { name: "Sort option, on", states: ["rest"], render: (t) => <div className="ds-menu"><button {...t("sort-option sort-option-on")}><span className="sort-check"><Check size={13} /></span>Newest First</button></div> },
      { name: "Dialog", states: ["rest"], wide: true, render: (t) => <div className="ds-row"><div {...t("modal ds-modal")}><div className="modal-head"><h2>Hide Industry?</h2><button className="icon-btn modal-close" tabIndex={-1} aria-label="Close"><X size={18} /></button></div><div className="modal-body"><p className="tag-dialog-note">Nothing is deleted.</p></div><div className="modal-foot"><button tabIndex={-1}>Cancel</button><button className="modal-apply" tabIndex={-1}>Hide Group</button></div></div></div> },
      { name: "Selection bar", states: ["rest"], wide: true, render: (t) => <div className="ds-row"><div {...t("tag-bar ds-static")}><span className="tag-bar-count">3 tags</span><div className="tag-actions"><button className="primary" tabIndex={-1}>Merge</button><button className="danger-btn" tabIndex={-1}>Delete</button></div></div></div> },
    ],
  },
  {
    id: "marks",
    name: "Marks",
    note: "The small things that carry the brand.",
    items: [
      { name: "Wordmark", states: ["rest", "hover"], render: (t) => <span {...t("wordmark-link ds-wordmark")}><Wordmark /></span> },
      { name: "Keep", states: ["rest", "hover", "focus"], render: (t) => <button {...t("icon-btn")} aria-label="Favorite"><Heart size={15} /></button> },
      { name: "Collect", states: ["rest", "hover", "focus"], render: (t) => <button {...t("icon-btn")} aria-label="Add to collection"><Bookmark size={15} /></button> },
      { name: "Discard", states: ["rest", "hover", "focus"], render: (t) => <button {...t("icon-btn")} aria-label="Delete"><Trash2 size={15} /></button> },
    ],
  },
];
