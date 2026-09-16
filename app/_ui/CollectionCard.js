"use client";
import { latestCapture } from "@/lib/captures";

// A collection reads as a stack rather than a row: one hero cover with three
// smaller ones beneath, so the card shows what's inside before you open it.
// Empty slots stay as placeholders so every card is the same height whether it
// holds one item or forty.
const SLOTS = 4;

export default function CollectionCard({ collection, resolve }) {
  const covers = (collection.preview || []).map(resolve).filter(Boolean);
  const [hero, ...rest] = covers;
  const href = `/collections/${collection.id}`;

  return (
    <a className="collection-card" href={href}>
      <span className="collection-cover">
        <span className="collection-cover-hero">
          {hero ? <Cover item={hero} /> : <span className="collection-cover-empty" />}
        </span>
        <span className="collection-cover-row">
          {Array.from({ length: SLOTS - 1 }).map((_, i) => {
            const item = rest[i];
            return (
              <span className="collection-cover-tile" key={i}>
                {item ? <Cover item={item} /> : <span className="collection-cover-empty" />}
              </span>
            );
          })}
        </span>
      </span>

      <span className="collection-card-name">{collection.name}</span>
      <span className="collection-card-meta">
        {collection.item_count} {collection.item_count === 1 ? "item" : "items"}
      </span>
    </a>
  );
}

// A cover is either a screenshot that fills the slot or a brand mark sitting
// on it. Both are covers; only one is a picture.
function Cover({ item }) {
  if (item.icon) {
    return (
      <span className="collection-cover-icon">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.icon} alt="" />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={item.thumb} alt="" />;
}

// Turns a {target_type, target_id} ref into something to draw, given the
// library lists the page already fetched.
export function makeResolver(sites, components, resources = new Map()) {
  return (ref) => {
    if (ref.target_type === "site") {
      const site = sites.get(ref.target_id);
      const thumb = site && latestCapture(site.capture, "desktop")?.thumb_url;
      return thumb ? { thumb } : null;
    }
    // A resource has no capture, so its cover is the brand mark -- drawn inset
    // on a plain tile rather than cropped to fill, since a favicon is 32px of
    // artwork and stretching it across a cover slot is a mess.
    if (ref.target_type === "resource") {
      const resource = resources.get(ref.target_id);
      return resource?.favicon_url ? { icon: resource.favicon_url } : null;
    }
    const component = components.get(ref.target_id);
    return component?.image_url ? { thumb: component.image_url } : null;
  };
}
