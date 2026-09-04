"use client";
import { useEffect, useState } from "react";
import { latestCapture } from "@/lib/captures";
import LibraryBrowser from "./LibraryBrowser";

const ADAPTER = {
  kind: "site",
  href: (site) => `/sites/${site.id}`,
  externalUrl: (site) => site.url,
  name: (site) => site.name || site.domain,
  meta: (site) => site.domain,
  thumb: (site) => latestCapture(site.capture, "desktop")?.thumb_url || null,
  faviconUrl: (site) => site.favicon_url || null,
  pendingLabel: "Capturing…",
};

export default function WebsitesTab({ allTags, refreshKey }) {
  const [sites, setSites] = useState([]);
  const [query, setQuery] = useState("");

  async function loadSites(q) {
    const res = await fetch(`/api/sites${q ? `?q=${encodeURIComponent(q)}` : ""}`);
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

  return (
    <LibraryBrowser
      items={sites}
      allTags={allTags}
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder="Search name, summary, notes, tags, discovered pages…"
      emptyMessage="Nothing saved yet — use Add to save your first site."
      noun="site"
      adapter={ADAPTER}
      storageKey="specimen.view.websites"
    />
  );
}
