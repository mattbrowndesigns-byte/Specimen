"use client";
import { useEffect, useRef, useState, use as usePromise } from "react";
import TagCombobox from "../../_ui/TagCombobox";
import UtilityBar from "../../_ui/UtilityBar";
import RelatedSection from "../../_ui/RelatedSection";
import SaveActions from "../../_ui/SaveActions";
import Favicon from "../../_ui/Favicon";
import DiscoveredPages from "../../_ui/DiscoveredPages";
import { archiveUrl, captureTimeline, formatCaptureDate } from "@/lib/captures";

const FACET_LABELS = {
  vertical: "Vertical",
  page_type: "Page Type",
  block_pattern: "Block / Pattern",
  aesthetic: "Aesthetic",
};
const FACETS = Object.keys(FACET_LABELS);

// Observed Actions round trip is roughly 60-75s: install deps, run Playwright
// across both viewports, upload, call back. Used only to pace the progress
// estimate -- completion is detected from new capture rows, not this clock.
const CAPTURE_ESTIMATE_SECONDS = 75;

export default function SiteDetailPage({ params }) {
  const { id } = usePromise(params);

  const [site, setSite] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const [components, setComponents] = useState([]);
  const [viewport, setViewport] = useState("desktop");
  const [summaryDraft, setSummaryDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [savingField, setSavingField] = useState(null);
  const [recapturing, setRecapturing] = useState(false);
  const [error, setError] = useState(null);
  const [promoting, setPromoting] = useState(null);
  const [promoted, setPromoted] = useState({});
  const [selectedRun, setSelectedRun] = useState(null);
  const [deletingCapture, setDeletingCapture] = useState(false);
  const [captureElapsed, setCaptureElapsed] = useState(0);
  const [captureDone, setCaptureDone] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [wayback, setWayback] = useState({ state: "idle" });
  const [expandedCapture, setExpandedCapture] = useState(false);
  const timelineRef = useRef(null);
  const captureBaseline = useRef(0);

  async function load() {
    const res = await fetch(`/api/sites/${id}`);
    if (res.ok) {
      const data = await res.json();
      setSite(data.site);
      setSummaryDraft(data.site.summary || "");
      setNotesDraft(data.site.notes || "");
      setNameDraft(data.site.name || "");
    }
  }

  async function loadTags() {
    const res = await fetch("/api/tags");
    if (res.ok) {
      const data = await res.json();
      setAllTags(data.tags || []);
    }
  }

  async function loadComponents() {
    const res = await fetch(`/api/components?siteId=${id}`);
    if (res.ok) {
      const data = await res.json();
      setComponents(data.components || []);
    }
  }

  useEffect(() => {
    load();
    loadTags();
    loadComponents();
  }, [id]);

  useEffect(() => {
    if (!recapturing) return;
    const poll = setInterval(load, 4000);
    const tick = setInterval(() => setCaptureElapsed((s) => s + 1), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [recapturing]);

  // A capture run finishing is what ends the progress state -- new capture rows
  // land only once the Actions job has uploaded and called back.
  useEffect(() => {
    if (!recapturing || !site) return;
    if ((site.capture || []).length > captureBaseline.current) {
      setRecapturing(false);
      setCaptureDone(true);
      setSelectedRun(null);
    }
  }, [site, recapturing]);

  // Resolve the real archived snapshot for whichever capture is on screen.
  useEffect(() => {
    if (!site) return;
    const runs = captureTimeline(site.capture);
    const run = runs.find((r) => r.capturedAt === selectedRun) || runs[0];
    if (!run) return;

    let cancelled = false;
    setWayback({ state: "loading" });

    const stamp = new Date(run.capturedAt);
    const timestamp = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(
      stamp.getDate()
    ).padStart(2, "0")}`;

    fetch(`/api/wayback?url=${encodeURIComponent(site.url)}&timestamp=${timestamp}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setWayback(data.available ? { state: "found", url: data.url } : { state: "none" });
      })
      .catch(() => !cancelled && setWayback({ state: "none" }));

    return () => {
      cancelled = true;
    };
  }, [site, selectedRun]);

  // The strip runs oldest-to-newest, so start it scrolled to the newest end.
  useEffect(() => {
    const strip = timelineRef.current;
    if (strip) strip.scrollLeft = strip.scrollWidth;
  }, [site?.capture?.length]);

  async function saveField(field, value) {
    setSavingField(field);
    setError(null);
    const res = await fetch(`/api/sites/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    setSavingField(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Save failed");
      return;
    }
    await load();
  }

  async function addTag(facet, tagId) {
    if (!tagId) return;
    setError(null);
    const res = await fetch(`/api/sites/${id}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to add tag");
      return;
    }
    await load();
  }

  async function removeTag(tagId) {
    setError(null);
    const res = await fetch(`/api/sites/${id}/tags/${tagId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to remove tag");
      return;
    }
    await load();
  }

  async function createTag(facet, label) {
    setError(null);
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facet, label }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to create tag");
      return;
    }
    await addTag(facet, data.tag.id);
    await loadTags();
  }

  async function markReviewed() {
    await saveField("needs_review", false);
  }

  async function deleteCaptureRun(run) {
    const when = formatCaptureDate(run.capturedAt);
    if (!confirm(`Delete the capture from ${when}? The screenshots from that day are removed for good.`)) return;

    setDeletingCapture(true);
    setError(null);
    const res = await fetch(`/api/sites/${id}/captures?ids=${run.ids.join(",")}`, { method: "DELETE" });
    setDeletingCapture(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to delete that capture");
      return;
    }
    setSelectedRun(null);
    await load();
  }

  async function handleDelete() {
    if (!confirm(`Delete "${site.name || site.domain}" and all of its captures? This can't be undone.`)) return;
    const res = await fetch(`/api/sites/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to delete");
      return;
    }
    window.location.href = "/";
  }

  async function promotePage(page) {
    setPromoting(page.id);
    setError(null);
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: page.url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to promote page");
        return;
      }
      setPromoted((prev) => ({ ...prev, [page.id]: data.site.id }));
    } finally {
      setPromoting(null);
    }
  }

  async function recapture() {
    setError(null);
    setCaptureDone(false);
    setCaptureElapsed(0);
    captureBaseline.current = (site?.capture || []).length;
    setRecapturing(true);

    const res = await fetch(`/api/sites/${id}/recapture`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to start re-capture");
      setRecapturing(false);
    }
  }

  async function regenerateSummary() {
    setRegenerating(true);
    setError(null);
    const res = await fetch(`/api/sites/${id}/enrich`, { method: "POST" });
    setRegenerating(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't regenerate the summary");
      return;
    }
    setEditingSummary(false);
    await load();
  }

  if (!site) {
    return (
      <>
        <UtilityBar onError={setError} />
        <main className="page detail-page">
          <p>Loading…</p>
        </main>
      </>
    );
  }

  const pageTypeLabel = (slug) => {
    if (!slug) return "Unclassified";
    const match = allTags.find((t) => t.facet === "page_type" && t.slug === slug);
    return match?.label || slug;
  };

  const timeline = captureTimeline(site.capture);
  const activeRun = timeline.find((r) => r.capturedAt === selectedRun) || timeline[0];
  const capture = activeRun?.byViewport[viewport] || null;
  const hasMobile = Boolean(activeRun?.byViewport.mobile);
  const tagsByFacet = FACETS.map((facet) => ({
    facet,
    assigned: (site.tags || []).filter((t) => t.facet === facet),
    available: allTags.filter(
      (t) => t.facet === facet && t.is_approved && !(site.tags || []).some((st) => st.id === t.id)
    ),
  }));

  return (
    <>
      <UtilityBar onError={setError} />

      <main className="page detail-page">
        {error && <p className="error">{error}</p>}

        <div className="detail-header">
          <Favicon url={site.url} faviconUrl={site.favicon_url} alt={site.name} />
          <input
            className="name-input"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => nameDraft !== site.name && saveField("name", nameDraft)}
          />
          <div className="detail-actions">
            <SaveActions kind="site" id={site.id} name={site.name || site.domain} isFavorite={site.is_favorite} />
            {site.needs_review && <button onClick={markReviewed}>Mark reviewed</button>}
            <a className="visit-btn" href={site.url} target="_blank" rel="noopener noreferrer">
              Visit site ↗
            </a>
            <button onClick={recapture} disabled={recapturing}>
              {recapturing ? "Re-capturing…" : "Re-capture"}
            </button>
            <button onClick={handleDelete}>Delete</button>
          </div>
        </div>

        <p className="meta-line">Saved {formatCaptureDate(site.saved_at)}</p>

        {recapturing && (
          <div className="capture-status">
            <div className="capture-status-bar">
              <div
                className="capture-status-fill"
                style={{ width: `${Math.min(95, (captureElapsed / CAPTURE_ESTIMATE_SECONDS) * 100)}%` }}
              />
            </div>
            <p>
              Capturing this site —{" "}
              {captureElapsed < CAPTURE_ESTIMATE_SECONDS
                ? `about ${CAPTURE_ESTIMATE_SECONDS - captureElapsed}s remaining`
                : "finishing up, any moment now"}
              . This runs on a server, so it'll finish even if you leave this page.
            </p>
          </div>
        )}

        {captureDone && (
          <div className="capture-status capture-status-done">
            <p>
              ✓ New capture complete — added to the timeline below.
              <button onClick={() => setCaptureDone(false)}>Dismiss</button>
            </p>
          </div>
        )}

        {/* Capture on the left, everything you'd edit about the record on the
            right, so the tags and summary are readable without scrolling past a
            full-page screenshot. Collapses to one column on a narrow window. */}
        <div className="detail-columns">
          <div className="detail-main">
            <div className="capture-panel">
              {timeline.length > 1 && (
                <div className="capture-timeline" ref={timelineRef}>
                  {timeline
                    .slice()
                    .reverse()
                    .map((run, i, arr) => {
                      const isLatest = i === arr.length - 1;
                      return (
                        <button
                          key={run.capturedAt}
                          className={run.capturedAt === activeRun?.capturedAt ? "active" : ""}
                          onClick={() => setSelectedRun(run.capturedAt)}
                          title={new Date(run.capturedAt).toLocaleString()}
                        >
                          {formatCaptureDate(run.capturedAt)}
                          {isLatest && <span className="timeline-latest">Latest</span>}
                        </button>
                      );
                    })}
                </div>
              )}

              {activeRun && (
                <p className="capture-meta">
                  Captured {formatCaptureDate(activeRun.capturedAt)} ·{" "}
                  {wayback.state === "found" ? (
                    <a href={wayback.url} target="_blank" rel="noopener noreferrer">
                      View on the Wayback Machine
                    </a>
                  ) : wayback.state === "loading" ? (
                    <span>Checking the Wayback Machine…</span>
                  ) : (
                    <span title="archive.org has no snapshot near this date">No Wayback snapshot</span>
                  )}{" "}
                  ·{" "}
                  <button
                    className="capture-delete"
                    onClick={() => deleteCaptureRun(activeRun)}
                    disabled={deletingCapture}
                  >
                    {deletingCapture ? "Deleting…" : "Delete this capture"}
                  </button>
                </p>
              )}

              {hasMobile && (
                <div className="viewport-toggle">
                  <button className={viewport === "desktop" ? "active" : ""} onClick={() => setViewport("desktop")}>
                    Desktop
                  </button>
                  <button className={viewport === "mobile" ? "active" : ""} onClick={() => setViewport("mobile")}>
                    Mobile
                  </button>
                </div>
              )}

              <div
                className={`detail-capture${expandedCapture ? "" : " detail-capture-collapsed"}${
                  viewport === "mobile" ? " detail-capture-mobile" : ""
                }`}
              >
                {capture?.full_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={capture.full_url} alt={site.name} />
                ) : (
                  <div className="placeholder">{recapturing ? "Capturing…" : "No capture yet"}</div>
                )}
                {!expandedCapture && capture?.full_url && <div className="capture-fade" />}
              </div>

              {capture?.full_url && (
                <button className="capture-expand" onClick={() => setExpandedCapture((v) => !v)}>
                  {expandedCapture ? "Collapse screenshot" : "Expand full screenshot"}
                </button>
              )}
            </div>
          </div>

          <aside className="detail-side">
            <section className="detail-section">
              <div className="section-head">
                <h2>AI summary</h2>
                {!editingSummary && (
                  <div className="section-head-actions">
                    <button onClick={() => setEditingSummary(true)}>Edit</button>
                    <button onClick={regenerateSummary} disabled={regenerating}>
                      {regenerating ? "Regenerating…" : "Regenerate"}
                    </button>
                  </div>
                )}
              </div>

              {editingSummary ? (
                <>
                  <textarea value={summaryDraft} onChange={(e) => setSummaryDraft(e.target.value)} rows={4} />
                  <div className="section-head-actions">
                    <button
                      className="primary"
                      disabled={savingField === "summary"}
                      onClick={async () => {
                        await saveField("summary", summaryDraft);
                        setEditingSummary(false);
                      }}
                    >
                      {savingField === "summary" ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => {
                        setSummaryDraft(site.summary || "");
                        setEditingSummary(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <p className="summary-text">
                  {site.summary || <span className="summary-empty">No summary yet.</span>}
                </p>
              )}
            </section>

            <section className="detail-section">
              <h2>Tags</h2>
              {tagsByFacet.map(({ facet, assigned, available }) => (
                <div className="facet-row" key={facet}>
                  <span className="facet-name">{FACET_LABELS[facet]}</span>
                  <TagCombobox
                    assigned={assigned}
                    available={available}
                    onAdd={(tagId) => addTag(facet, tagId)}
                    onRemove={removeTag}
                    onCreate={(label) => createTag(facet, label)}
                  />
                </div>
              ))}
            </section>

            <section className="detail-section">
              <h2>Notes</h2>
              <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={4} />
              <button disabled={savingField === "notes"} onClick={() => saveField("notes", notesDraft)}>
                {savingField === "notes" ? "Saving…" : "Save notes"}
              </button>
            </section>

            <DiscoveredPages
              pages={site.pages || []}
              pageTypeLabel={pageTypeLabel}
              promoted={promoted}
              promoting={promoting}
              onPromote={promotePage}
            />
          </aside>
        </div>


        {components.length > 0 && (
          <section className="detail-section">
            <h2>Components from this site</h2>
            <div className="grid">
              {components.map((c) => (
                <a className="card component-card" key={c.id} href={`/components/${c.id}`}>
                  <div className="thumb">
                    {c.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.image_url} alt={c.name || "Component"} />
                    ) : (
                      <div className="placeholder">Processing…</div>
                    )}
                  </div>
                  <div className="card-footer">
                    <span className="name">{c.name || "Untitled component"}</span>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}
        <RelatedSection kind="site" item={site} />
      </main>
    </>
  );
}
