"use client";
import { useMemo, useState } from "react";
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
// It tabs when it's holding more than one kind, and doesn't when it isn't --
// a collection of six websites has nothing to separate, and a tab strip with
// one tab on it is furniture. With a mix, the tabs answer the question someone
// opening a shared collection actually has: what did you save, and of what.
//
// The resources tab renders rows rather than cards for the same reason the
// Resources tab does on the dashboard: a resource has no picture, and a card
// built around a missing one is mostly empty rectangle.
const TAB_LABELS = { site: "Websites", component: "Components", resource: "Resources" };
const TAB_ORDER = ["site", "component", "resource"];
export default function RecordGrid({ entries, emptyMessage, onRemove, removeLabel }) {
  const [tab, setTab] = useState(null);

  const tabs = useMemo(() => {
    const counts = new Map();
    for (const { kind } of entries) counts.set(kind, (counts.get(kind) || 0) + 1);
    return TAB_ORDER.filter((kind) => counts.get(kind)).map((kind) => [kind, counts.get(kind)]);
  }, [entries]);

  if (entries.length === 0) return <p className="empty">{emptyMessage}</p>;

  const active = tab && tabs.some(([kind]) => kind === tab) ? tab : tabs[0]?.[0];
  const shown = tabs.length > 1 ? entries.filter((e) => e.kind === active) : entries;
  const strip =
    tabs.length > 1 ? (
      <div className="tab-switcher">
        {tabs.map(([kind, count]) => (
          <button
            key={kind}
            className={active === kind ? "active" : ""}
            onClick={() => setTab(kind)}
          >
            {TAB_LABELS[kind]}
            <span className="tab-count">{count}</span>
          </button>
        ))}
      </div>
    ) : null;

  // One tab's worth of resources is the Resources tab, rows and all.
  if (tabs.length > 1 && active === "resource") {
    return (
      <>
        {strip}
        <div className="resource-list">
          {shown.map(({ item }) => (
            <div className="resource-row" key={item.id}>
              <Favicon
                url={item.url}
                faviconUrl={item.favicon_url}
                fills={item.favicon_fills !== false}
                alt={item.title}
              />
              <div className="resource-body">
                <span className="resource-head">
                  <a
                    className="resource-title"
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.title}
                  </a>
                  <span className="resource-domain">{item.domain}</span>
                </span>
                {item.summary && <span className="resource-summary">{item.summary}</span>}
              </div>
              {onRemove && (
                <button className="link-btn" onClick={() => onRemove("resource", item.id)}>
                  {removeLabel}
                </button>
              )}
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      {strip}
      <div className="grid">
      {shown.map(({ kind, item }) => {
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
    </>
  );
}
