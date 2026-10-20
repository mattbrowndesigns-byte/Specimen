"use client";
import { useEffect, useState } from "react";
import { latestCapture } from "@/lib/captures";
import LibraryBrowser from "./LibraryBrowser";

const ADAPTER = {
  kind: "site",
  date: (site) => site.saved_at,
  href: (site) => `/sites/${site.id}`,
  externalUrl: (site) => site.url,
  name: (site) => site.name || site.domain,
  meta: (site) => site.domain,
  thumb: (site) => latestCapture(site.capture, "desktop")?.thumb_url || null,
  faviconUrl: (site) => site.favicon_url || null,
  // Not a constant, because there are now three reasons a site has no picture
  // and only one of them is worth waiting for. No captures at all means the
  // job is still running. Captures but no desktop one means the run delivered
  // and the desktop shot failed -- the callback writes every viewport in a
  // single insert, so any row from that run means the run is over. Saying
  // "Capturing" to the second case is a promise nothing is going to keep.
  //
  // And a bulk import adds a third: queued, which is a site nothing has
  // started on yet. After importing a hundred bookmarks most of the grid is in
  // that state for a few hours, and ninety cards all claiming to be capturing
  // right now is the same false promise at ninety times the volume.
  // A card's placeholder is two lines of small type, so it says which of
  // these happened and the site's own page says why. What it must not do is
  // keep saying "Capturing" about a run that ended hours ago, which is what
  // "no capture rows" used to mean on its own.
  pendingLabel: (site) => {
    if (site.capture_state === "queued") return "Waiting its turn…";
    if (site.capture_state === "failed" || site.capture_error) return "Capture failed";
    return (site.capture || []).length > 0 ? "No desktop capture" : "Capturing…";
  },
};

export default function WebsitesTab({
  allTags,
  refreshKey,
  onAdd,
  incomingQuery,
  onIncomingUsed,
  onSearchElsewhere,
}) {
  const [sites, setSites] = useState([]);
  const [query, setQuery] = useState("");

  async function loadSites(q) {
    const res = await fetch(
      `/api/sites${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    );
    if (res.ok) {
      const data = await res.json();
      setSites(data.sites || []);
    }
  }

  // Debounced so typing doesn't fire a search per keystroke.
  useEffect(() => {
    const timeout = setTimeout(() => loadSites(query), 300);
    return () => clearTimeout(timeout);
  }, [query, refreshKey]);

  useEffect(() => {
    const interval = setInterval(() => loadSites(query), 5000);
    return () => clearInterval(interval);
  }, [query]);

  // A query handed over from another tab's dead end. It arrives once, is
  // applied once, and is cleared by the parent so switching back later doesn't
  // re-run a search you have since moved on from.
  useEffect(() => {
    if (incomingQuery == null) return;
    setQuery(incomingQuery);
    onIncomingUsed?.();
  }, [incomingQuery, onIncomingUsed]);

  return (
    <LibraryBrowser
      items={sites}
      allTags={allTags}
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder="Search name, summary, notes, tags, discovered pages…"
      emptyHeadline="Start your library."
      emptyMessage="Paste any URL. Kivli captures it on desktop and mobile, writes a summary, and tags it for you."
      noun="site"
      adapter={ADAPTER}
      onAdd={onAdd}
      storageKey="specimen.view.websites"
      onSearchElsewhere={onSearchElsewhere}
    />
  );
}
