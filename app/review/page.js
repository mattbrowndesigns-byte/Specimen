"use client";
import { useEffect, useState } from "react";
import { latestCapture } from "@/lib/captures";
import ReviewEditModal from "../_ui/ReviewEditModal";
import UtilityBar from "../_ui/UtilityBar";
import Favicon from "../_ui/Favicon";

const FACET_LABELS = {
  vertical: "Vertical",
  page_type: "Page Type",
  block_pattern: "Block / Pattern",
  aesthetic: "Aesthetic",
};

// Selection state is per section rather than one shared set: the three
// sections take different actions (mark reviewed vs approve/reject), so a
// single "12 selected" spanning all of them couldn't offer one sensible verb.
function useSelection(items) {
  const [selected, setSelected] = useState(() => new Set());

  // Anything that leaves the queue leaves the selection with it, so a stale id
  // can't sit in the set and inflate the count.
  const ids = items.map((i) => i.id);
  const live = new Set(ids);
  const pruned = [...selected].filter((id) => live.has(id));
  if (pruned.length !== selected.size) {
    setSelected(new Set(pruned));
  }

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === ids.length ? new Set() : new Set(ids)));
  }

  return {
    selected,
    count: selected.size,
    allSelected: ids.length > 0 && selected.size === ids.length,
    toggle,
    toggleAll,
    clear: () => setSelected(new Set()),
  };
}

export default function ReviewPage() {
  const [sites, setSites] = useState([]);
  const [components, setComponents] = useState([]);
  const [pendingTags, setPendingTags] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const siteSelection = useSelection(sites);
  const componentSelection = useSelection(components);
  const tagSelection = useSelection(pendingTags);

  async function load() {
    const [sitesRes, componentsRes, tagsRes] = await Promise.all([
      fetch("/api/sites"),
      fetch("/api/components"),
      fetch("/api/tags"),
    ]);
    if (sitesRes.ok) {
      const data = await sitesRes.json();
      setSites((data.sites || []).filter((s) => s.needs_review));
    }
    if (componentsRes.ok) {
      const data = await componentsRes.json();
      setComponents((data.components || []).filter((c) => c.needs_review));
    }
    if (tagsRes.ok) {
      const data = await tagsRes.json();
      setPendingTags((data.tags || []).filter((t) => !t.is_approved));
      setAllTags((data.tags || []).filter((t) => t.is_approved));
    }
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, []);

  // One place for every write on this page, single or bulk. Requests go out in
  // parallel and every failure is counted, so a bulk action can't half-succeed
  // and look like it worked.
  async function run(requests, verb) {
    setError(null);
    setBusy(true);
    const results = await Promise.all(
      requests.map((r) => r.catch(() => ({ ok: false })))
    );
    setBusy(false);
    const failed = results.filter((res) => !res.ok).length;
    if (failed > 0) {
      setError(
        failed === results.length
          ? `Couldn't ${verb}. Nothing was changed.`
          : `${failed} of ${results.length} couldn't be ${verb === "approve those tags" ? "approved" : "updated"}.`
      );
    }
    await load();
  }

  function patch(path, body) {
    return fetch(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const markReviewed = (kind, ids) =>
    run(
      ids.map((id) => patch(`/api/${kind}/${id}`, { needs_review: false })),
      "mark those reviewed"
    );

  const approveTags = (ids) =>
    run(ids.map((id) => patch(`/api/tags/${id}`, { is_approved: true })), "approve those tags");

  const rejectTags = (ids) =>
    run(
      ids.map((id) => fetch(`/api/tags/${id}`, { method: "DELETE" })),
      "reject those tags"
    );

  const nothingToReview =
    loaded && sites.length === 0 && components.length === 0 && pendingTags.length === 0;

  return (
    <>
      <UtilityBar onError={setError} />

      <main className="page page-wide">
        <div className="top-nav">
          <h1>Review Queue</h1>
        </div>

        {error && <p className="error">{error}</p>}

        {nothingToReview && <p className="empty-small">Nothing needs review right now.</p>}

        {pendingTags.length > 0 && (
          <section className="tag-section">
            <BulkBar
              title="Pending tags"
              total={pendingTags.length}
              selection={tagSelection}
              busy={busy}
              actions={[
                {
                  label: "Approve",
                  primary: true,
                  onClick: () => approveTags([...tagSelection.selected]),
                },
                { label: "Reject", onClick: () => rejectTags([...tagSelection.selected]) },
              ]}
            />
            <div className="tag-list">
              {pendingTags.map((tag) => (
                <div
                  className={`tag-row${tagSelection.selected.has(tag.id) ? " row-selected" : ""}`}
                  key={tag.id}
                >
                  <SelectBox
                    checked={tagSelection.selected.has(tag.id)}
                    onChange={() => tagSelection.toggle(tag.id)}
                    label={`Select ${tag.label}`}
                  />
                  <span className="tag-facet">{FACET_LABELS[tag.facet]}</span>
                  <span className="tag-label">{tag.label}</span>
                  <div className="tag-actions">
                    <button disabled={busy} onClick={() => approveTags([tag.id])}>
                      Approve
                    </button>
                    <button disabled={busy} onClick={() => rejectTags([tag.id])}>
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {sites.length > 0 && (
          <section className="tag-section">
            <BulkBar
              title="Sites to review"
              total={sites.length}
              selection={siteSelection}
              busy={busy}
              actions={[
                {
                  label: "Mark reviewed",
                  primary: true,
                  onClick: () => markReviewed("sites", [...siteSelection.selected]),
                },
              ]}
            />
            <div className="review-list">
              {sites.map((site) => {
                const thumb = latestCapture(site.capture, "desktop")?.thumb_url;
                return (
                  <ReviewRow
                    key={site.id}
                    item={site}
                    thumb={thumb}
                    faviconUrl={site.favicon_url}
                    fills={site.favicon_fills !== false}
                    linkUrl={site.url}
                    fallbackName={site.domain}
                    busy={busy}
                    checked={siteSelection.selected.has(site.id)}
                    onToggle={() => siteSelection.toggle(site.id)}
                    onEdit={() => setEditing({ kind: "sites", item: { ...site, thumb } })}
                    onMarkReviewed={() => markReviewed("sites", [site.id])}
                  />
                );
              })}
            </div>
          </section>
        )}

        {components.length > 0 && (
          <section className="tag-section">
            <BulkBar
              title="Components to review"
              total={components.length}
              selection={componentSelection}
              busy={busy}
              actions={[
                {
                  label: "Mark reviewed",
                  primary: true,
                  onClick: () => markReviewed("components", [...componentSelection.selected]),
                },
              ]}
            />
            <div className="review-list">
              {components.map((c) => (
                <ReviewRow
                  key={c.id}
                  item={c}
                  thumb={c.image_url}
                  linkUrl={c.source_url}
                  fallbackName="Untitled component"
                  busy={busy}
                  checked={componentSelection.selected.has(c.id)}
                  onToggle={() => componentSelection.toggle(c.id)}
                  onEdit={() => setEditing({ kind: "components", item: { ...c, thumb: c.image_url } })}
                  onMarkReviewed={() => markReviewed("components", [c.id])}
                />
              ))}
            </div>
          </section>
        )}

        {editing && (
          <ReviewEditModal
            item={editing.item}
            kind={editing.kind}
            allTags={allTags}
            onClose={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              await load();
            }}
          />
        )}
      </main>
    </>
  );
}

// Section heading and select-all in one row, with the bulk verbs appearing only
// once something is ticked -- buttons that would act on nothing shouldn't sit
// there looking available.
function BulkBar({ title, total, selection, actions, busy }) {
  return (
    <div className="bulk-bar">
      <label className="bulk-select-all">
        <input
          type="checkbox"
          checked={selection.allSelected}
          ref={(el) => {
            // Partial selection is its own state, not "off".
            if (el) el.indeterminate = selection.count > 0 && !selection.allSelected;
          }}
          onChange={selection.toggleAll}
          aria-label={`Select all ${title.toLowerCase()}`}
        />
        <span className="bulk-select-all-label">Select all</span>
        <h2>
          {title} ({total})
        </h2>
      </label>

      {selection.count > 0 && (
        <div className="bulk-actions">
          <span className="bulk-count">{selection.count} selected</span>
          {actions.map((action) => (
            <button
              key={action.label}
              className={action.primary ? "primary" : ""}
              onClick={action.onClick}
              disabled={busy}
            >
              {busy ? "Working…" : action.label}
            </button>
          ))}
          <button className="link-btn" onClick={selection.clear} disabled={busy}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

// A checkbox that doesn't inherit the row's click. The row opens the edit
// modal, so without stopping propagation every tick would also open it.
function SelectBox({ checked, onChange, label }) {
  return (
    <input
      type="checkbox"
      className="select-box"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
    />
  );
}

// One row per queue item. The whole row opens the edit modal, so a correction
// can be made without leaving the queue and losing your place.
function ReviewRow({
  item,
  thumb,
  faviconUrl,
  fills,
  linkUrl,
  fallbackName,
  checked,
  onToggle,
  onEdit,
  onMarkReviewed,
  busy,
}) {
  return (
    <div
      className={`review-row${checked ? " row-selected" : ""}`}
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onEdit()}
    >
      <SelectBox checked={checked} onChange={onToggle} label={`Select ${item.name || fallbackName}`} />
      <div className="review-thumb">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={item.name || fallbackName} />
        ) : (
          <div className="placeholder">No image</div>
        )}
      </div>
      <div className="review-info">
        <span className="review-name">
          <Favicon url={linkUrl} faviconUrl={faviconUrl} fills={fills} alt={item.name || fallbackName} />
          {item.name || fallbackName}
        </span>
        <p className="review-summary">
          {item.summary || <span className="summary-empty">No summary — the AI pass didn&apos;t complete.</span>}
        </p>
        <div className="card-tags">
          {(item.tags || []).map((tag, i) => (
            <span className={`chip${tag.is_approved ? "" : " chip-pending"}`} key={i}>
              {tag.label}
            </span>
          ))}
        </div>
      </div>
      <button
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onMarkReviewed();
        }}
      >
        Mark reviewed
      </button>
    </div>
  );
}
