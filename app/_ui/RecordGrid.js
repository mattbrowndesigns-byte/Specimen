"use client";
import { latestCapture } from "@/lib/captures";
import SaveActions from "./SaveActions";
import Favicon from "./Favicon";

// A plain grid of mixed sites and components, for the pages that show a
// hand-picked set rather than a browsable library: favorites and one
// collection. No search or filters here on purpose -- those lists are already
// the filter.
//
// Each entry is { kind: "site" | "component", item }.
export default function RecordGrid({ entries, emptyMessage, onRemove, removeLabel }) {
  if (entries.length === 0) return <p className="empty">{emptyMessage}</p>;

  return (
    <div className="grid">
      {entries.map(({ kind, item }) => {
        const href = kind === "site" ? `/sites/${item.id}` : `/components/${item.id}`;
        const thumb =
          kind === "site" ? latestCapture(item.capture, "desktop")?.thumb_url : item.image_url;
        const name = item.name || item.domain || "Untitled";
        return (
          <div className="card" key={`${kind}-${item.id}`}>
            <div className="card-media">
              <a className={`thumb${kind === "component" ? " thumb-natural" : ""}`} href={href}>
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt={name} />
                ) : (
                  <div className="placeholder">No image</div>
                )}
              </a>
              <SaveActions
                className="card-actions"
                kind={kind}
                id={item.id}
                name={name}
                isFavorite={item.is_favorite}
              />
            </div>
            <div className="card-footer">
              <span className="card-title">
                <Favicon
                  url={kind === "site" ? item.url : item.source_url}
                  faviconUrl={item.favicon_url}
                  fills={item.favicon_fills !== false}
                  alt={name}
                />
                <a className="name" href={href} title={item.summary || undefined}>
                  {name}
                </a>
              </span>
              <span className="related-kind">{kind}</span>
            </div>
            {onRemove && (
              <button className="link-btn card-remove" onClick={() => onRemove(kind, item.id)}>
                {removeLabel}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
