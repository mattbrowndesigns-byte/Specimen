"use client";
import { useCallback, useEffect, useState } from "react";
import WebsitesTab from "./_ui/WebsitesTab";
import ComponentsTab from "./_ui/ComponentsTab";
import UtilityBar from "./_ui/UtilityBar";
import CaptureProgress from "./_ui/CaptureProgress";
import { addItem, jobFromSearch } from "@/lib/addItem";

export default function Home() {
  const [tab, setTab] = useState("websites");
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

  // An Add from another page arrives as ?job=…; pick it up so its progress bar
  // shows here, then clean the URL so a refresh doesn't re-add it.
  useEffect(() => {
    const job = jobFromSearch(window.location.search);
    if (!job) return;
    setTab(job.kind === "component" ? "components" : "websites");
    setJobs((prev) => (prev.some((j) => j.key === job.key) ? prev : [...prev, job]));
    window.history.replaceState({}, "", "/");
  }, []);

  // Add is in the utility bar rather than inside a tab, so saving never depends
  // on which tab happens to be open. A component save switches you to that tab,
  // since cropping is the next thing you'll do.
  async function handleAdd(kind, url) {
    setError(null);
    try {
      const result = await addItem(kind, url);
      if (result.error) {
        setError(result.error);
        return false;
      }
      setTab(kind === "website" ? "websites" : "components");
      if (result.capture) setPendingCapture(result.capture);
      if (result.site) setRefreshKey((k) => k + 1);
      setJobs((prev) => [...prev, result.job]);
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
    <>
      <UtilityBar onAdd={handleAdd} />

      <main className="page page-wide">
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
    </>
  );
}
