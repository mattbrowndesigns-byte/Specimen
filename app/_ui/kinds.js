import { Globe, Crop, Link2 } from "lucide-react";

// One kind, one icon, everywhere it appears: the Add menu, the dashboard's
// tabs, a shared collection's tabs and the page a stranger lands on. That only
// stays true if there is one place that says so -- the same reason the feature
// list lives in lib/features.js and two surfaces read it rather than each
// keeping its own copy.
//
// Three sets of ids, because three things already named these differently and
// renaming them would touch far more than it buys. `id` is what the database
// calls the record and what RecordGrid keys on, `tab` is the dashboard's own
// state, `add` is what the save routes take.
export const KINDS = [
  {
    id: "site",
    tab: "websites",
    add: "website",
    label: "Websites",
    one: "Website",
    blurb: "Capture and tag a whole page",
    Icon: Globe,
  },
  {
    id: "component",
    tab: "components",
    add: "component",
    label: "Components",
    one: "Component",
    blurb: "Capture a page, then crop a region",
    Icon: Crop,
  },
  {
    id: "resource",
    tab: "resources",
    add: "resource",
    label: "Resources",
    one: "Resource",
    blurb: "Save a tool or reference",
    Icon: Link2,
  },
];

export const KIND = Object.fromEntries(KINDS.map((kind) => [kind.id, kind]));
