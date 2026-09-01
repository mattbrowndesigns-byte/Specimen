"use client";
import { useEffect, useState } from "react";
import WebsitesTab from "./_ui/WebsitesTab";
import ComponentsTab from "./_ui/ComponentsTab";

export default function Home() {
  const [tab, setTab] = useState("websites");
  const [needsReviewCount, setNeedsReviewCount] = useState(0);

  useEffect(() => {
    async function loadCount() {
      const [sitesRes, componentsRes] = await Promise.all([fetch("/api/sites"), fetch("/api/components")]);
      let count = 0;
      if (sitesRes.ok) {
        const data = await sitesRes.json();
        count += (data.sites || []).filter((s) => s.needs_review).length;
      }
      if (componentsRes.ok) {
        const data = await componentsRes.json();
        count += (data.components || []).filter((c) => c.needs_review).length;
      }
      setNeedsReviewCount(count);
    }
    loadCount();
    const interval = setInterval(loadCount, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="page">
      <div className="top-nav">
        <h1>Inspiration Library</h1>
        <div className="nav-links">
          {needsReviewCount > 0 && (
            <a href="/review" className="review-badge">
              {needsReviewCount} to review
            </a>
          )}
          <a href="/tags">Manage tags →</a>
        </div>
      </div>

      <div className="tab-switcher">
        <button className={tab === "websites" ? "active" : ""} onClick={() => setTab("websites")}>
          Websites
        </button>
        <button className={tab === "components" ? "active" : ""} onClick={() => setTab("components")}>
          Components
        </button>
      </div>

      {tab === "websites" ? <WebsitesTab /> : <ComponentsTab />}
    </main>
  );
}
