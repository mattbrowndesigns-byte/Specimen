"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import WebsitesTab from "./_ui/WebsitesTab";
import ComponentsTab from "./_ui/ComponentsTab";
import ResourcesTab from "./_ui/ResourcesTab";
import VisualsTab from "./_ui/VisualsTab";
import UtilityBar from "./_ui/UtilityBar";
import { KINDS } from "./_ui/kinds";
import CaptureProgress from "./_ui/CaptureProgress";
import UploadProgress from "./_ui/UploadProgress";
import { useUploads } from "./_ui/uploads";
import Arcade from "./_ui/Arcade";
import { DemoProgress } from "./_ui/DemoAdd";
import DemoTour from "./_ui/DemoTour";
import { useDemoPhase } from "./_ui/demoState";
import SiteFooter from "./_ui/SiteFooter";
import HeroRotator from "./_ui/HeroRotator";
import ConnectNote from "./_ui/ConnectNote";
import { addItem, jobFromSearch, resourceFromSearch } from "@/lib/addItem";

// The last upload that brought its tab forward. Outside the component,
// because a panel can outlive a visit to another page, and coming back to the
// dashboard for something else shouldn't switch tabs a second time.
let lastUploadShown = 0;

// Takes ?tab= and friends off the address. It keeps the entry's own state,
// which is where Next marks an entry as its own: wiping it made Back to here
// a full reload, so closing the visuals viewer landed you on Websites.
function clearSearch() {
  window.history.replaceState(window.history.state, "", "/");
}

export default function Home() {
  const [tab, setTab] = useState("websites");
  const [allTags, setAllTags] = useState([]);
  const [pendingCapture, setPendingCapture] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [newResource, setNewResource] = useState(null);
  const [describeId, setDescribeId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // A search carried over from another tab's empty result. The parent holds it
  // because the tab it's going to hasn't mounted yet -- the tabs render one at
  // a time -- so there is nobody else to hand it to.
  const [handoff, setHandoff] = useState(null);

  const searchElsewhere = useCallback((nextTab, query) => {
    setTab(nextTab);
    setHandoff({ tab: nextTab, query });
  }, []);

  // Cleared the moment the receiving tab has taken it, so coming back to that
  // tab later doesn't re-run a search you've moved on from.
  const clearHandoff = useCallback(() => setHandoff(null), []);

  const incomingFor = (id) => (handoff?.tab === id ? handoff.query : null);
  const [error, setError] = useState(null);

  // The demo's staged save, started from the utility bar here or on any other
  // page. The panel outlives the phase by a few seconds so the confirmation is
  // read after the card has landed, the same order a real save happens in.
  // One per kind, since each kind has its own replayed save.
  const demoPhases = {
    website: useDemoPhase("website"),
    component: useDemoPhase("component"),
    resource: useDemoPhase("resource"),
  };
  const [demoPanels, setDemoPanels] = useState([]);
  const demoStarted = Object.keys(demoPhases).find((kind) => demoPhases[kind] === "capturing");
  useEffect(() => {
    if (!demoStarted) return;
    setDemoPanels((prev) => (prev.includes(demoStarted) ? prev : [...prev, demoStarted]));
    setTab(KINDS.find((k) => k.add === demoStarted).tab);
  }, [demoStarted]);

  // An upload is watched from here however it was started -- the Add popover
  // on this page or another, or a drop on a tab -- so a new one brings its own
  // tab forward, the way any other save does. Describing components is not a
  // new save, and whoever walked to another tab meanwhile stays there.
  const uploads = useUploads();
  const newest = uploads.findLast((u) => u.kind !== "describe");
  const newestId = newest?.id;
  const newestTab = newest?.kind === "component" ? "components" : "visuals";
  useEffect(() => {
    if (!newestId || newestId <= lastUploadShown) return;
    lastUploadShown = newestId;
    setTab(newestTab);
  }, [newestId, newestTab]);

  const loadTags = useCallback(async () => {
    const res = await fetch("/api/tags");
    if (res.ok) {
      const data = await res.json();
      setAllTags(data.tags || []);
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
  //
  // The two lists also treat a pending proposal differently. The design chip
  // strip is a filter over a reviewed vocabulary, so it stays approved-only. A
  // folder is where a resource LIVES: a resource whose only type is a pending
  // proposal had tags, so it wasn't Unsorted, and its folder wasn't in the
  // strip either -- it was nowhere. And the type picker has to offer the
  // proposal, or typing "Job Board" beside an existing Job Board offers to
  // create a second one.
  const designTags = useMemo(
    // medium is a visual's own facet, like resource_type is a resource's.
    () => allTags.filter((t) => t.facet !== "resource_type" && t.facet !== "medium" && t.is_approved),
    [allTags]
  );
  const resourceTags = useMemo(() => allTags.filter((t) => t.facet === "resource_type"), [allTags]);
  const visualTags = useMemo(
    () => allTags.filter((t) => ["medium", "aesthetic", "vertical"].includes(t.facet) && t.is_approved),
    [allTags]
  );

  // An Add from another page arrives as ?job=… (a capture to watch) or
  // ?resource=… (a row that exists and just needs describing); pick it up, then
  // clean the URL so a refresh doesn't re-run it.
  useEffect(() => {
    // The visuals picker sends you back here with ?tab=visuals once you've
    // saved, so you land on the board your picks just joined.
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (requestedTab && KINDS.some((k) => k.tab === requestedTab)) {
      setTab(requestedTab);
      clearSearch();
      return;
    }

    const resourceId = resourceFromSearch(window.location.search);
    if (resourceId) {
      setTab("resources");
      setDescribeId(resourceId);
      clearSearch();
      return;
    }

    // A screen grab from the extension: already here, so straight into the
    // crop tool. The address keeps its id until the grab has been read, so a
    // reload on the way asks again; one that can't be read is still on the
    // tab's crop list.
    const cropId = new URLSearchParams(window.location.search).get("crop");
    if (cropId) {
      setTab("components");
      fetch(`/api/components/capture/${cropId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.capture?.status === "ready" && !data.capture.cropped_at) setPendingCapture(data.capture);
          clearSearch();
        })
        .catch(() => {});
      return;
    }

    const job = jobFromSearch(window.location.search);
    if (!job) return;
    setTab(job.kind === "component" ? "components" : "websites");
    setJobs((prev) => (prev.some((j) => j.key === job.key) ? prev : [...prev, job]));
    clearSearch();
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
      if (result.redirect) {
        window.location.href = result.redirect;
        return true;
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

        {demoPanels.map((kind) => (
          <DemoProgress
            key={kind}
            kind={kind}
            onHidden={() => setDemoPanels((prev) => prev.filter((k) => k !== kind))}
          />
        ))}

        {uploads.map((upload) => (
          <UploadProgress key={upload.id} upload={upload} />
        ))}

        {jobs.map((job) => (
          <CaptureProgress key={job.key} job={job} onDone={(result) => finishJob(job, result)} />
        ))}

        <ConnectNote />

        {/* One sentence, Dribbble-style: the purple top line changes, the
            bottom line holds. */}
        <h2 className="page-hero">
          <HeroRotator />
          <br />
          <span className="page-hero-rest">and let AI sort it all.</span>
        </h2>

        {/* Icons from the shared kind list -- the same three the Add menu
            shows, so the thing you pressed to save it is the thing you press
            to find it again. */}
        <div className="tab-switcher" data-tour="tabs">
          {KINDS.map(({ tab: id, label, Icon }) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
            >
              <Icon size={16} />
              {/* data-label lets the label reserve its bold width, so the
                  held tab going semi-bold doesn't nudge its neighbours. */}
              <span className="tab-label" data-label={label}>
                {label}
              </span>
            </button>
          ))}
        </div>

        {tab === "websites" && (
          <WebsitesTab
            allTags={designTags}
            refreshKey={refreshKey}
            onAdd={handleAdd}
            incomingQuery={incomingFor("websites")}
            onIncomingUsed={clearHandoff}
            onSearchElsewhere={searchElsewhere}
          />
        )}
        {tab === "components" && (
          <ComponentsTab
            allTags={designTags}
            pendingCapture={pendingCapture}
            setPendingCapture={setPendingCapture}
            refreshKey={refreshKey}
            onAdd={handleAdd}
            incomingQuery={incomingFor("components")}
            onIncomingUsed={clearHandoff}
            onSearchElsewhere={searchElsewhere}
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
            incomingQuery={incomingFor("resources")}
            onIncomingUsed={clearHandoff}
            onSearchElsewhere={searchElsewhere}
          />
        )}
        {tab === "visuals" && (
          <VisualsTab
            allTags={visualTags}
            incomingQuery={incomingFor("visuals")}
            onIncomingUsed={clearHandoff}
            onSearchElsewhere={searchElsewhere}
          />
        )}
      </main>
      {/* Mounted here rather than inside a progress panel, so a capture
          landing mid-round can't take the round with it. */}
      <Arcade />
      {/* Renders nothing outside the demo, and once a visitor has seen it. */}
      <DemoTour />
      <SiteFooter />
    </>
  );
}
