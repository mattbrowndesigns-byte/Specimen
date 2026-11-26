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
import { addItem, cropFromSearch, cropUrl, jobFromSearch, resourceFromSearch } from "@/lib/addItem";
import { BUILT_IN_GROUPS, KIND_IDS, groupsFor, tagsFor } from "@/lib/tagGroups";

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
  const [groups, setGroups] = useState(BUILT_IN_GROUPS);
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
      setGroups(data.groups || BUILT_IN_GROUPS);
    }
  }, []);

  // On a tab change and when an upload lands as well: a tag exists for the
  // page once something wears it, and the first save of a kind brings its
  // group's first tags with it.
  const uploading = uploads.length;
  useEffect(() => {
    loadTags();
  }, [loadTags, refreshKey, tab, uploading]);

  // The tag vocabulary is one list from one endpoint, and each tab is handed
  // only its own groups, counted over its own saves. Handing every tab the
  // whole list put "Icons" in the websites chip strip, where clicking it could
  // only ever return nothing.
  //
  // A pending proposal is treated differently in one place. The other strips
  // are filters over a reviewed vocabulary, so they stay approved-only. A
  // folder is where a resource LIVES: a resource whose only type is a pending
  // proposal had tags, so it wasn't Unsorted, and its folder wasn't in the
  // strip either -- it was nowhere. And the type picker has to offer the
  // proposal, or typing "Job Board" beside an existing Job Board offers to
  // create a second one.
  const byKind = useMemo(
    () =>
      Object.fromEntries(
        KIND_IDS.map((kind) => [
          kind,
          { groups: groupsFor(groups, kind), tags: tagsFor(allTags, groups, kind, { pending: kind === "resource" }) },
        ])
      ),
    [allTags, groups]
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
      // A search to run there: Add's "Show It" for a resource you already have.
      const query = new URLSearchParams(window.location.search).get("q");
      if (query) setHandoff({ tab: requestedTab, query });
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

    const cropId = cropFromSearch(window.location.search);
    if (cropId) {
      window.location.replace(cropUrl(cropId));
      return;
    }

    const job = jobFromSearch(window.location.search);
    if (!job) return;
    setTab("websites");
    setJobs((prev) => (prev.some((j) => j.key === job.key) ? prev : [...prev, job]));
    clearSearch();
  }, []);

  // Add is in the utility bar rather than inside a tab, so saving never depends
  // on which tab happens to be open. A component or a visual goes to a page of
  // its own, since choosing is the next thing you'll do.
  async function handleAdd(kind, url, options) {
    setError(null);
    try {
      const result = await addItem(kind, url, options);
      if (result.existing) return result;
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
      setTab("websites");
      if (result.site) setRefreshKey((k) => k + 1);
      setJobs((prev) => [...prev, result.job]);
      return true;
    } catch {
      setError("Couldn't reach the server");
      return false;
    }
  }

  function finishJob(job) {
    setJobs((prev) => prev.filter((j) => j.key !== job.key));
    setRefreshKey((k) => k + 1);
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
          <CaptureProgress key={job.key} job={job} onDone={() => finishJob(job)} />
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
            allTags={byKind.site.tags}
            groups={byKind.site.groups}
            refreshKey={refreshKey}
            onAdd={handleAdd}
            incomingQuery={incomingFor("websites")}
            onIncomingUsed={clearHandoff}
            onSearchElsewhere={searchElsewhere}
          />
        )}
        {tab === "components" && (
          <ComponentsTab
            allTags={byKind.component.tags}
            groups={byKind.component.groups}
            refreshKey={refreshKey}
            onAdd={handleAdd}
            incomingQuery={incomingFor("components")}
            onIncomingUsed={clearHandoff}
            onSearchElsewhere={searchElsewhere}
          />
        )}
        {tab === "resources" && (
          <ResourcesTab
            allTags={byKind.resource.tags}
            groups={byKind.resource.groups}
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
            allTags={byKind.visual.tags}
            groups={byKind.visual.groups}
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
