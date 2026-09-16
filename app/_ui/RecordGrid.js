"use client";
import { latestCapture } from "@/lib/captures";
import SaveActions from "./SaveActions";
import Favicon from "./Favicon";

// A plain grid of mixed sites, components and resources, for the pages that
// show a hand-picked set rather than a browsable library: favorites and one
// collection. No search or filters here on purpose -- those lists are already
// the filter.
//
// Each entry is { kind: "site" | "component" | "resource", item }.
//
// A resource has no capture and no detail page, so it gets a cover drawn from
// its own favicon rather than the "No image" placeholder the other two fall
// back to. That placeholder means "the capture hasn't landed yet", which would
// be a lie on a record that is never going to have one, and it's the whole
// reason resources are rows on their own tab.
export default function RecordGrid({ entries, emptyMessage, onRemove, removeLabel }) {
  if (entries.length === 0) return <p className="empty">{emptyMessage}</p>;

  return (
    <div className="grid">
      {entries.map(({ kind, item }) => {
        const isResource = kind === "resource";
        const href = isResource
          ? item.url
          : kind === "site"
            ? `/sites/${item.id}`
            : `/components/${item.id}`;
        const thumb =
          kind === "site" ? latestCapture(item.capture, "desktop")?.thumb_url : item.image_url;
        const name = item.title || item.name || item.domain || "Untitled";
        return (
          <div className="card" key={`${kind}-${item.id}`}>
            <div className="card-media">
              {isResource ? (
                <a
                  className="thumb resource-cover"
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Favicon
                    url={item.url}
                    faviconUrl={item.favicon_url}
                    fills={item.favicon_fills !== false}
                    alt={name}
                  />
                  <span className="resource-cover-domain">{item.domain}</span>
                </a>
              ) : (
                <a className={`thumb${kind === "component" ? " thumb-natural" : ""}`} href={href}>
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt={name} />
                  ) : (
                    <div className="placeholder">No image</div>
                  )}
                </a>
              )}
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
                  url={kind === "component" ? item.source_url : item.url}
                  faviconUrl={item.favicon_url}
                  fills={item.favicon_fills !== false}
                  alt={name}
                />
                <a
                  className="name"
                  href={href}
                  title={item.summary || undefined}
                  target={isResource ? "_blank" : undefined}
                  rel={isResource ? "noopener noreferrer" : undefined}
                >
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
