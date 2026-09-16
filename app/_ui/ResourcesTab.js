"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  Check,
  Folder,
  FolderOpen,
  Pencil,
  Inbox,
  List,
  AlignJustify,
  Share2,
} from "lucide-react";
import Favicon from "./Favicon";
import SaveActions from "./SaveActions";
import AddMenu from "./AddMenu";
import ResourceModal from "./ResourceModal";
import ResourceProgress from "./ResourceProgress";
import ShareModal from "./ShareModal";
import FeatureRotator from "./FeatureRotator";
import SearchField from "./SearchField";
import ResultCount from "./ResultCount";

// Two views, not the library's three. A card needs a picture and a resource
// hasn't got one, so the choice here is how much of the record you want beside
// the title: the summary and tags, or nothing at all.
const VIEWS = [
  { id: "list", label: "List", Icon: List },
  { id: "headlines", label: "Headlines", Icon: AlignJustify },
];

const SORTS = [
  { id: "newest", label: "Newest First" },
  { id: "oldest", label: "Oldest First" },
  { id: "az", label: "Name A–Z" },
  { id: "za", label: "Name Z–A" },
];

// Rows are cheap to render next to a card, but a library of several hundred
// links still shouldn't all arrive to show you the newest twenty.
const PAGE_SIZE = 40;

// The sentinel for "no type tag yet". It's a folder in the strip rather than a
// state you have to go looking for: the whole point of the strip is that
// everything is somewhere, and the things that are nowhere are the ones that
// need you.
const UNSORTED = "__unsorted__";

export default function ResourcesTab({
  allTags,
  refreshKey,
  onAdd,
  newResource,
  describeId,
  onResourceHandled,
}) {
  const [resources, setResources] = useState([]);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState(null);
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState("list");
  const [progress, setProgress] = useState(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [editing, setEditing] = useState(null);
  const [sharingFolder, setSharingFolder] = useState(null);
  const [describing, setDescribing] = useState(new Set());
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const sortRef = useRef(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/resources");
    if (res.ok) {
      const data = await res.json();
      setResources(data.resources || []);
    } else {
      setError("Couldn't load your resources");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    try {
      const savedSort = localStorage.getItem("specimen.sort.resources");
      if (savedSort && SORTS.some((o) => o.id === savedSort)) setSort(savedSort);
      const savedView = localStorage.getItem("specimen.view.resources");
      if (savedView && VIEWS.some((o) => o.id === savedView)) setView(savedView);
    } catch {
      // localStorage can be unavailable; the defaults are fine.
    }
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setSortOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // A saved resource is shown the instant its row exists and is described
  // afterwards, because there's no capture to wait on — the only slow part is
  // the model, and a row with a title and a favicon is already useful.
  const describe = useCallback(async (id, label) => {
    setDescribing((prev) => new Set(prev).add(id));
    // Only an Add shows the bar. A Regenerate from the modal has its own
    // spinner and shouldn't put a progress panel at the top of the page.
    if (label) setProgress({ label, done: false, queued: false });
    try {
      const res = await fetch(`/api/resources/${id}/enrich`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setResources((prev) => prev.map((r) => (r.id === id ? data.resource : r)));
        if (label) {
          setProgress({
            label: data.resource.title || label,
            done: true,
            queued: Boolean(data.queued),
          });
          // A queued result is the only place that message appears and it asks
          // the reader to do nothing, so it sits longer than a clean finish.
          setTimeout(() => setProgress(null), data.queued ? 9000 : 2500);
        } else if (!data.described) {
          setError(
            data.queued
              ? "Saved. The AI was busy, so its summary will fill in within the hour."
              : "Saved, but the AI couldn't describe it. Open it and hit Regenerate."
          );
        }
      }
    } catch {
      setProgress(null);
      setError("Saved, but the AI couldn't be reached.");
    } finally {
      setDescribing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  // Two ways in, one effect. Saving from the dashboard hands over the whole row
  // so it can be shown before any request finishes; saving from another page
  // hands over only an id, and the row arrives with the list. Either way the
  // id is what says "this one still needs describing".
  useEffect(() => {
    if (!describeId) return;
    if (newResource) {
      setResources((prev) =>
        prev.some((r) => r.id === newResource.id) ? prev : [newResource, ...prev]
      );
    }
    onResourceHandled?.();
    describe(describeId, newResource?.title || newResource?.domain || "that link");
  }, [describeId, newResource, describe, onResourceHandled]);

  const folders = useMemo(() => {
    const types = allTags.filter((t) => t.facet === "resource_type");
    const counts = new Map();
    let unsorted = 0;
    for (const resource of resources) {
      const tags = resource.tags || [];
      if (!tags.length) unsorted += 1;
      for (const tag of tags) counts.set(tag.id, (counts.get(tag.id) || 0) + 1);
    }
    // A folder nobody has put anything in is clutter, not an invitation —
    // the vocabulary ships with thirteen and most libraries will use six.
    const used = types
      .map((tag) => ({ ...tag, count: counts.get(tag.id) || 0 }))
      .filter((tag) => tag.count > 0)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return { used, unsorted };
  }, [allTags, resources]);

  // Folders lead, ranked by how full they are, then titles, then domains. A
  // domain is worth offering here and isn't on the other tabs: half of what a
  // resource is remembered by is where it lives -- you look for "figma", not
  // for the title of the page.
  const searchTerms = useMemo(() => {
    const labels = folders.used.map((tag) => tag.label);
    const titles = resources.map((r) => r.title).filter(Boolean);
    const domains = resources.map((r) => r.domain).filter(Boolean);
    const seen = new Set();
    return [...labels, ...titles, ...domains].filter((label) => {
      const key = label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [folders, resources]);

  const openFolder = useMemo(
    () => (folder && folder !== UNSORTED ? folders.used.find((t) => t.id === folder) || null : null),
    [folder, folders]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = resources;

    if (folder === UNSORTED) {
      list = list.filter((r) => !(r.tags || []).length);
    } else if (folder) {
      list = list.filter((r) => (r.tags || []).some((t) => t.id === folder));
    }

    if (q) {
      list = list.filter((r) =>
        [r.title, r.summary, r.notes, r.url, ...(r.tags || []).map((t) => t.label)]
          .filter(Boolean)
          .some((field) => field.toLowerCase().includes(q))
      );
    }

    const byName = (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    const byDate = (a, b) => new Date(b.saved_at) - new Date(a.saved_at);
    const sorted = [...list];
    if (sort === "az") return sorted.sort(byName);
    if (sort === "za") return sorted.sort((a, b) => byName(b, a));
    if (sort === "oldest") return sorted.sort((a, b) => byDate(b, a));
    return sorted.sort(byDate);
  }, [resources, query, folder, sort]);

  useEffect(() => {
    setShown(PAGE_SIZE);
  }, [query, folder, sort]);

  function remember(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Not being able to remember a preference is not worth an error.
    }
  }

  function chooseSort(id) {
    setSort(id);
    setSortOpen(false);
    remember("specimen.sort.resources", id);
  }

  function chooseView(id) {
    setView(id);
    remember("specimen.view.resources", id);
  }

  function applyEdit(updated) {
    setResources((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  function removeResource(id) {
    setResources((prev) => prev.filter((r) => r.id !== id));
    setEditing(null);
  }

  const page = filtered.slice(0, shown);
  const remaining = filtered.length - page.length;

  return (
    <>
      {error && (
        <p className="error">
          {error} <button onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}

      {progress && (
        <ResourceProgress label={progress.label} done={progress.done} queued={progress.queued} />
      )}

      <div className="toolbar">
        <SearchField
          placeholder="Search resources by name, summary, notes or tag…"
          value={query}
          onChange={setQuery}
          historyKey="specimen.recent.resources"
          terms={searchTerms}
        />
      </div>

      {(folders.used.length > 0 || folders.unsorted > 0) && (
        <div className="folder-strip">
          {folders.used.map((tag) => {
            const on = folder === tag.id;
            return (
              <button
                key={tag.id}
                className={`folder${on ? " folder-on" : ""}`}
                onClick={() => setFolder(on ? null : tag.id)}
                aria-pressed={on}
              >
                {on ? <FolderOpen size={17} /> : <Folder size={17} />}
                <span className="folder-name">{tag.label}</span>
                <span className="folder-count">{tag.count}</span>
              </button>
            );
          })}
          {folders.unsorted > 0 && (
            <button
              className={`folder folder-unsorted${folder === UNSORTED ? " folder-on" : ""}`}
              onClick={() => setFolder(folder === UNSORTED ? null : UNSORTED)}
              aria-pressed={folder === UNSORTED}
            >
              <Inbox size={17} />
              <span className="folder-name">Unsorted</span>
              <span className="folder-count">{folders.unsorted}</span>
            </button>
          )}
        </div>
      )}

      <div className="results-bar">
        <ResultCount
          count={filtered.length}
          noun="resource"
          query={query}
          onClear={() => setQuery("")}
        />
        <div className="results-controls">
          {/* An icon, not a labelled button: sharing is an occasional aside and
              a third button beside List / Headlines / Newest First competed
              with the controls you actually reach for. Same treatment as the
              share control on a collection's page.

              Only a real folder can be shared. "Unsorted" is the absence of a
              tag rather than a tag, so there's nothing for a link to resolve
              to -- and a link whose contents change every time you file
              something would be a strange thing to have sent. */}
          {openFolder && (
            <button
              className="icon-btn"
              onClick={() => setSharingFolder(openFolder)}
              title={`Share the ${openFolder.label} folder`}
              aria-label={`Share the ${openFolder.label} folder`}
            >
              <Share2 size={16} />
            </button>
          )}

          <div className="view-switch">
            {VIEWS.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={view === id ? "active" : ""}
                onClick={() => chooseView(id)}
                title={label}
                aria-pressed={view === id}
              >
                <Icon size={15} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="sort-menu" ref={sortRef}>
            <button className="sort-btn" onClick={() => setSortOpen((v) => !v)} aria-expanded={sortOpen}>
              <ArrowDownUp size={14} />
              {SORTS.find((o) => o.id === sort)?.label}
            </button>
            {sortOpen && (
              <div className="sort-pop">
                <span className="sort-pop-head">Sort By</span>
                {SORTS.map((option) => (
                  <button
                    key={option.id}
                    className={`sort-option${sort === option.id ? " sort-option-on" : ""}`}
                    onClick={() => chooseSort(option.id)}
                  >
                    <span className="sort-check">{sort === option.id && <Check size={13} />}</span>
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {loaded && resources.length === 0 && (
        <div className="empty-state">
          <h2 className="empty-state-headline">The tools, not the inspiration.</h2>
          <p className="empty-state-body">
            An icon set, a stock library, an AI product — the links you save for what they do rather
            than how they look. No screenshot, no detail page. Just a title, a sentence and a folder.
          </p>
          {onAdd && <AddMenu onSubmit={onAdd} variant="hero" />}
          <FeatureRotator className="empty-state-rotator" />
        </div>
      )}
      {resources.length > 0 && filtered.length === 0 && (
        <p className="empty">Nothing matches that.</p>
      )}

      {view === "list" && page.length > 0 && (
        <div className="resource-list">
          {page.map((resource) => (
            <div className="resource-row" key={resource.id}>
              <Favicon
                url={resource.url}
                faviconUrl={resource.favicon_url}
                fills={resource.favicon_fills !== false}
                alt={resource.title}
              />

              <div className="resource-body">
                <span className="resource-head">
                  {/* `stretch-link` grows this anchor's hit area to the whole
                      row. It stays one real link -- middle-click, right-click
                      and the focus order are unchanged -- and the edit,
                      favourite and collection controls sit above the overlay,
                      so the row opens the site and the controls still act on
                      the record. */}
                  <a
                    className="resource-title stretch-link"
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {resource.title}
                  </a>
                  <span className="resource-domain">{resource.domain}</span>
                </span>

                {describing.has(resource.id) ? (
                  <span className="resource-summary resource-summary-pending">Describing…</span>
                ) : (
                  resource.summary && <span className="resource-summary">{resource.summary}</span>
                )}

                {(resource.tags || []).length > 0 && (
                  <span className="resource-tags">
                    {resource.tags.map((tag) => (
                      <button
                        key={tag.id}
                        className={`chip chip-filter${tag.is_approved ? "" : " chip-pending"}`}
                        onClick={() => setFolder(tag.id)}
                      >
                        {tag.label}
                      </button>
                    ))}
                  </span>
                )}
              </div>

              <span className="resource-actions">
                <button
                  className="icon-btn"
                  onClick={() => setEditing(resource)}
                  title="Edit"
                  aria-label={`Edit ${resource.title}`}
                >
                  <Pencil size={15} />
                </button>
                <SaveActions
                  kind="resource"
                  id={resource.id}
                  name={resource.title}
                  isFavorite={resource.is_favorite}
                />
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Title only: the favicon, the name, where it lives, and nothing else.
          For when you know what you're looking for and want forty of them on
          screen rather than eight. */}
      {view === "headlines" && page.length > 0 && (
        <div className="headline-list">
          {page.map((resource) => (
            <div className="headline-item" key={resource.id}>
              <Favicon
                url={resource.url}
                faviconUrl={resource.favicon_url}
                fills={resource.favicon_fills !== false}
                alt={resource.title}
              />
              <a
                className="row-name stretch-link"
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {resource.title}
              </a>
              <span className="row-domain">{resource.domain}</span>
              <span className="resource-actions headline-actions">
                <button
                  className="icon-btn"
                  onClick={() => setEditing(resource)}
                  title="Edit"
                  aria-label={`Edit ${resource.title}`}
                >
                  <Pencil size={15} />
                </button>
                <SaveActions
                  kind="resource"
                  id={resource.id}
                  name={resource.title}
                  isFavorite={resource.is_favorite}
                />
              </span>
            </div>
          ))}
        </div>
      )}

      {remaining > 0 && (
        <div className="load-more-row">
          <button className="load-more" onClick={() => setShown((n) => n + PAGE_SIZE)}>
            Load More
          </button>
          <span className="load-more-count">
            Showing {page.length} of {filtered.length}
          </span>
        </div>
      )}

      {sharingFolder && (
        <ShareModal
          kind="folder"
          targetId={sharingFolder.id}
          title={`the ${sharingFolder.label} folder`}
          onClose={() => setSharingFolder(null)}
        />
      )}

      {editing && (
        <ResourceModal
          resource={editing}
          allTags={allTags}
          onSaved={applyEdit}
          onDeleted={removeResource}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
