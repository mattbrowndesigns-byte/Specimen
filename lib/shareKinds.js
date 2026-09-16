// The scopes a share link can have, in the order the picker shows them.
//
// Sharing used to be all-or-nothing: the whole library, or one collection.
// With three tabs that's an over-answer -- sending someone your component
// crops is no reason to hand over 150 saved websites too -- so each tab can be
// shared on its own, and so can one resource folder.
export const SHARE_SCOPES = [
  {
    kind: "library",
    label: "Everything",
    hint: "All three tabs — websites, components and resources",
  },
  { kind: "sites", label: "Websites only", hint: "Captured pages and their tags" },
  { kind: "components", label: "Components only", hint: "The regions you've cropped out" },
  { kind: "resources", label: "Resources only", hint: "Saved tools and references" },
];

export const SHARE_KINDS = [
  "library",
  "sites",
  "components",
  "resources",
  "collection",
  "folder",
];

// The two that name a row rather than a tab.
export const TARGETED_KINDS = ["collection", "folder"];

// What each tab-level kind is called on the page a stranger opens. A
// collection and a folder use their own name instead.
// Title Case: this is a page title, not a sentence, and "Matt's inspiration
// library" set at 44px reads as a fragment of prose that lost its start.
export const SCOPE_NOUN = {
  library: "Inspiration Library",
  sites: "Websites",
  components: "Components",
  resources: "Resources",
};
