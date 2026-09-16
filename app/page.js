"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import WebsitesTab from "./_ui/WebsitesTab";
import ComponentsTab from "./_ui/ComponentsTab";
import ResourcesTab from "./_ui/ResourcesTab";
import UtilityBar from "./_ui/UtilityBar";
import { KINDS } from "./_ui/kinds";
import CaptureProgress from "./_ui/CaptureProgress";
import SiteFooter from "./_ui/SiteFooter";
import { addItem, jobFromSearch, resourceFromSearch } from "@/lib/addItem";

export default function Home() {
  const [tab, setTab] = useState("websites");
  const [allTags, setAllTags] = useState([]);
  const [pendingCapture, setPendingCapture] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [newResource, setNewResource] = useState(null);
  const [describeId, setDescribeId] = useState(null);
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

  // The tag vocabulary is one list from one endpoint, but the two libraries do
  // not share it. resource_type describes what a tool IS; the other four
  // describe how a page is DESIGNED, and neither set can ever match the other's
  // records. Handing every tab the whole list put "Icons" in the websites chip
  // strip, where clicking it could only ever return nothing.
  const designTags = useMemo(() => allTags.filter((t) => t.facet !== "resource_type"), [allTags]);
  const resourceTags = useMemo(() => allTags.filter((t) => t.facet === "resource_type"), [allTags]);

  // An Add from another page arrives as ?job=… (a capture to watch) or
  // ?resource=… (a row that exists and just needs describing); pick it up, then
  // clean the URL so a refresh doesn't re-run it.
  useEffect(() => {
    const resourceId = resourceFromSearch(window.location.search);
    if (resourceId) {
      setTab("resources");
      setDescribeId(resourceId);
      window.history.replaceState({}, "", "/");
      return;
    }

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
      if (kind === "resource") {
        setTab("resources");
        setNewResource(result.resource);
        setDescribeId(result.resource.id);
        return true;
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

  // Clearing both is what stops the describe effect firing twice, and the tag
  // reload is how a newly proposed type reaches the folder strip.
  const handleResourceHandled = useCallback(() => {
    setNewResource(null);
    setDescribeId(null);
    loadTags();
  }, [loadTags]);

  return (
    <>
      <UtilityBar onAdd={handleAdd} />

      <main className="page page-wide">
        {error && <p className="error">{error}</p>}

        {jobs.map((job) => (
          <CaptureProgress key={job.key} job={job} onDone={(result) => finishJob(job, result)} />
        ))}

        <h2 className="page-hero">
          Save what inspires you.
          <br />
          Find it when you need it.
        </h2>

        {/* Icons from the shared kind list -- the same three the Add menu
            shows, so the thing you pressed to save it is the thing you press
            to find it again. */}
        <div className="tab-switcher">
          {KINDS.map(({ tab: id, label, Icon }) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        {tab === "websites" && (
          <WebsitesTab allTags={designTags} refreshKey={refreshKey} onAdd={handleAdd} />
        )}
        {tab === "components" && (
          <ComponentsTab
            allTags={designTags}
            pendingCapture={pendingCapture}
            setPendingCapture={setPendingCapture}
            refreshKey={refreshKey}
            onAdd={handleAdd}
          />
        )}
        {tab === "resources" && (
          <ResourcesTab
            allTags={resourceTags}
            refreshKey={refreshKey}
            onAdd={handleAdd}
            newResource={newResource}
            describeId={describeId}
            onResourceHandled={handleResourceHandled}
          />
        )}
      </main>
      <SiteFooter />
    </>
  );
}
