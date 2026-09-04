"use client";
import { useCallback, useEffect, useState } from "react";
import WebsitesTab from "./_ui/WebsitesTab";
import ComponentsTab from "./_ui/ComponentsTab";
import AddMenu from "./_ui/AddMenu";
import CaptureProgress from "./_ui/CaptureProgress";

export default function Home() {
  const [tab, setTab] = useState("websites");
  const [needsReviewCount, setNeedsReviewCount] = useState(0);
  const [allTags, setAllTags] = useState([]);
  const [pendingCapture, setPendingCapture] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState(null);

  const loadTags = useCallback(async () => {
    const res = await fetch("/api/tags");
    if (res.ok) {
      const data = await res.json();
      setAllTags((data.tags || []).filter((t) => t.is_approved));
    }
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags, refreshKey]);

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

  // Add is in the header rather than inside a tab, so saving never depends on
  // which tab happens to be open. A component save switches you to that tab,
  // since cropping is the next thing you'll do.
  async function handleAdd(kind, url) {
    setError(null);
    try {
      if (kind === "website") {
        const res = await fetch("/api/sites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Couldn't save that URL");
          return false;
        }
        setTab("websites");
        setRefreshKey((k) => k + 1);
        setJobs((prev) => [...prev, { key: `site-${data.site.id}`, kind: "website", id: data.site.id, label: data.site.name || data.site.domain }]);
        return true;
      }

      const res = await fetch("/api/components/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't start that capture");
        return false;
      }
      setTab("components");
      setPendingCapture(data.capture);
      setJobs((prev) => [...prev, { key: `cap-${data.capture.id}`, kind: "component", id: data.capture.id, label: data.capture.domain }]);
      return true;
    } catch {
      setError("Couldn't reach the server");
      return false;
    }
  }

  function finishJob(job, result) {
    setJobs((prev) => prev.filter((j) => j.key !== job.key));
    setRefreshKey((k) => k + 1);
    if (job.kind === "component" && result) setPendingCapture(result);
  }

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
          <a href="/tags">Manage tags</a>
          <AddMenu onSubmit={handleAdd} />
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {jobs.map((job) => (
        <CaptureProgress key={job.key} job={job} onDone={(result) => finishJob(job, result)} />
      ))}

      <div className="tab-switcher">
        <button className={tab === "websites" ? "active" : ""} onClick={() => setTab("websites")}>
          Websites
        </button>
        <button className={tab === "components" ? "active" : ""} onClick={() => setTab("components")}>
          Components
        </button>
      </div>

      {tab === "websites" ? (
        <WebsitesTab allTags={allTags} refreshKey={refreshKey} />
      ) : (
        <ComponentsTab
          allTags={allTags}
          pendingCapture={pendingCapture}
          setPendingCapture={setPendingCapture}
          refreshKey={refreshKey}
        />
      )}
    </main>
  );
}
