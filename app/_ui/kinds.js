import { Globe, Crop, Link2, Images } from "lucide-react";

// One kind, one icon, everywhere it appears: the Add menu, the dashboard's
// tabs, a shared collection's tabs and the page a stranger lands on. That only
// stays true if there is one place that says so -- the same reason the feature
// list lives in lib/features.js and two surfaces read it rather than each
// keeping its own copy.
//
// The order is the order everywhere: what you look at first, websites then
// components then visuals, and resources last, which are kept for what they do.
// Resources came before visuals only because they were built first.
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
    id: "visual",
    tab: "visuals",
    add: "visual",
    label: "Visuals",
    one: "Visual",
    blurb: "Save the images from any page",
    Icon: Images,
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
