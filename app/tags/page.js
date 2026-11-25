"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Eye, EyeOff, Pencil, Plus } from "lucide-react";
import UtilityBar from "../_ui/UtilityBar";
import SiteFooter from "../_ui/SiteFooter";
import TagBoard, { familiesOf } from "../_ui/TagBoard";
import { ConfirmDialog, GroupDialog, LimitDialog, MergeDialog, RenameDialog, plural } from "../_ui/TagDialogs";
import { KINDS } from "../_ui/kinds";
import { CUSTOM_LIMIT, countsByKind, customInUse, groupsFor, kindLabel, kindList } from "@/lib/tagGroups";

// The vocabulary, and the one place it's tidied.
//
// Groups on the left, one group's tags on the right. It was every tag in the
// library as a full-width row: 158 of them, three buttons each, 9,830 pixels,
// and nothing saying which library a group was for or how often a tag was used.
//
// The list is the dashboard's own tabs, and a group used on three of them is
// under all three. It was a "Shared" heading first, which was truer and which
// nobody looking for their website tags looks under. What keeps that safe is
// everything that changes a shared tag saying where else it reaches: merging
// Minimal under Websites also merges it on three hundred visuals.
//
// There is still no moving a tag between groups. A group is the question its
// tags answer, and what the AI reads; a tag under the wrong one is deleted and
// typed again.

const send = (url, method, body) =>
  fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

// What the list shows: each tab's groups, then what's been hidden. A built-in
// group taken off one tab is hidden there and nowhere else; one the owner made
// was never on the tabs it isn't on, so it has nothing to bring back.
function railSections(groups) {
  const sections = KINDS.map(({ id, label, Icon }) => ({
    id,
    label,
    Icon,
    items: groupsFor(groups, id).map((g) => ({ group: g, kind: id })),
  }));
  const hidden = groups.flatMap((g) => {
    if (g.hidden) return [{ group: g, kind: null }];
    if (!g.built_in) return [];
    return g.all_kinds.filter((k) => !g.kinds.includes(k)).map((k) => ({ group: g, kind: k, off: true }));
  });
  return [...sections, { id: "hidden", label: "Hidden", Icon: EyeOff, items: hidden }].filter((s) => s.items.length);
}

// Which of them are open, remembered on this device.
const OPEN_KEY = "specimen.tags.open";

// The list stays beside a long group without scrolling inside itself: when it's
// taller than the window, sticking by its foot instead of its top means the
// page's own scroll reaches all of it.
function useRailHeight() {
  const [node, setNode] = useState(null);
  useEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(() => node.style.setProperty("--rail-h", `${node.offsetHeight}px`));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return setNode;
}

export default function TagsPage() {
  const [data, setData] = useState(null); // { groups, tags, sizes }
  const [error, setError] = useState(null);
  const [current, setCurrent] = useState(null); // { key, kind }
  const [opened, setOpened] = useState(() => new Set(["site"]));
  const railRef = useRailHeight();
  // Added on this visit, so a tag you've just typed is on the tab you typed it on.
  const [fresh, setFresh] = useState(() => new Set());
  const [selected, setSelected] = useState(() => new Set());
  const [dialog, setDialog] = useState(null);
  // What the last merge would take to put back. Held here rather than in a
  // table: the regret arrives about ten seconds after the mistake, and a table
  // for it would want a user_id, RLS, a policy, a scoped query and something
  // to sweep rows nobody will ever use.
  const [undo, setUndo] = useState(null);
  const [undoing, setUndoing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/tags?all=1");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Couldn't load your tags");
      return null;
    }
    setData(body);
    return body;
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A group being filled in on old saves moves every quarter of an hour.
  const filling = data?.groups.some((g) => g.fill?.state === "queued");
  useEffect(() => {
    if (!filling) return;
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [filling, load]);

  const groups = useMemo(() => data?.groups || [], [data]);
  const tags = useMemo(() => data?.tags || [], [data]);
  const sections = useMemo(() => railSections(groups), [groups]);
  const all = sections.flatMap((section) => section.items.map((item) => ({ ...item, section: section.id })));
  const place =
    all.find((i) => i.group.key === current?.key && i.kind === current.kind) ||
    all.find((i) => i.group.key === current?.key) ||
    all[0];
  const group = place?.group;
  const kind = place?.kind || null;
  const hiddenHere = place?.section === "hidden";

  // Sorted here as well as in the query, where the database's alphabet puts
  // CTA before Card. `here` is the count on this tab, which is the number that
  // means something beside the tab's name.
  const groupTags = useMemo(
    () =>
      tags
        .filter((t) => t.facet === group?.key)
        .map((t) => ({ ...t, here: kind ? t.counts?.[kind] || 0 : t.usage_count || 0 }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [tags, group, kind]
  );
  // On this tab: what something here wears, and what's waiting to be. A word of
  // your own that nothing wears anywhere has no tab yet, so it's on all of
  // them. The AI's unused words never get this far (lib/tagStarters.js).
  const isHere = (t) => t.here > 0 || !t.usage_count || !t.is_approved || fresh.has(t.id);
  const shownTags = groupTags.filter(isHere);
  const pending = tags.filter((t) => !t.is_approved && groups.some((g) => g.key === t.facet && !g.hidden));
  const picked = shownTags.filter((t) => selected.has(t.id));
  const close = useCallback(() => setDialog(null), []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OPEN_KEY) || "null");
      if (Array.isArray(saved)) setOpened(new Set(saved));
    } catch {
      // Websites, then.
    }
  }, []);

  function keepOpened(next) {
    setOpened(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
    } catch {
      // Forgotten when you leave.
    }
  }

  function toggleSection(id) {
    const next = new Set(opened);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    keepOpened(next);
  }

  function open(key, nextKind) {
    setCurrent({ key, kind: nextKind });
    setSelected(new Set());
    if (nextKind && !opened.has(nextKind) && !hiddenHere) keepOpened(new Set(opened).add(nextKind));
  }

  // The number beside a group: the tags you'll see when you open it.
  const tagsOn = ({ group: g, kind: k }) =>
    tags.filter((t) => t.facet === g.key && (!k || t.counts?.[k] || !t.usage_count || !t.is_approved)).length;

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Runs a request and reads the page again. Returns what went wrong, for a
  // dialog to show where you're looking, or null.
  async function act(request, { failure, done } = {}) {
    const res = await request.catch(() => null);
    const body = (await res?.json().catch(() => ({}))) || {};
    if (!res?.ok) return body.error || failure || "That didn't work";
    await load();
    done?.(body);
    return null;
  }

  async function approve(list) {
    setError(null);
    const results = await Promise.all(list.map((t) => send(`/api/tags/${t.id}`, "PATCH", { is_approved: true }).catch(() => null)));
    if (results.some((res) => !res?.ok)) setError("Some of those couldn't be approved.");
    setSelected(new Set());
    await load();
  }

  async function addTag(label) {
    setError(null);
    const problem = await act(send("/api/tags", "POST", { facet: group.key, label }), {
      failure: "Couldn't add that tag",
      done: (body) => body.tag && setFresh((prev) => new Set(prev).add(body.tag.id)),
    });
    if (problem) setError(problem);
    return !problem;
  }

  function merge(list) {
    setDialog({ type: "merge", tags: list });
  }

  const byId = (id) => tags.find((t) => t.id === id);

  async function confirmMerge(sources, target, label) {
    return act(send("/api/tags/merge", "POST", { sourceIds: sources.map((t) => t.id), targetId: target.id, label }), {
      failure: "Merge failed",
      done: (body) => {
        setSelected(new Set());
        setDialog(null);
        setUndo({ ...body.undo, moved: body.moved, from: sources.map((t) => t.label), into: label });
      },
    });
  }

  async function undoMerge() {
    setError(null);
    setUndoing(true);
    const { target, merged, added } = undo;
    const problem = await act(send("/api/tags/merge/undo", "POST", { target, merged, added }), {
      failure: "Couldn't undo that merge",
      done: () => setUndo(null),
    });
    setUndoing(false);
    if (problem) setError(problem);
  }

  async function rename(tag, label) {
    const res = await send(`/api/tags/${tag.id}`, "PATCH", { label }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) || {};
    // Renaming to a name that's taken means the other one, so offer that.
    if (res?.status === 409 && body.conflict) {
      const other = byId(body.conflict.id);
      if (other) {
        merge([tag, other]);
        return null;
      }
    }
    if (!res?.ok) return body.error || "Couldn't rename that tag";
    await load();
    setSelected(new Set());
    setDialog(null);
    return null;
  }

  async function removeTags(list) {
    const results = await Promise.all(list.map((t) => send(`/api/tags/${t.id}`, "DELETE").catch(() => null)));
    await load();
    setSelected(new Set());
    if (results.some((res) => !res?.ok)) return "Some of those couldn't be deleted.";
    setDialog(null);
    return null;
  }

  const full = customInUse(groups).length >= CUSTOM_LIMIT;

  function newGroup() {
    setDialog(full ? { type: "limit", then: "new" } : { type: "group" });
  }

  const saveGroup = (existing) => (body) =>
    act(existing ? send(`/api/tag-groups/${existing.key}`, "PATCH", body) : send("/api/tag-groups", "POST", body), {
      failure: "Couldn't save that group",
      done: (answer) => {
        setDialog(null);
        if (answer.key) open(answer.key, body.kinds[0]);
        if (answer.fillError) setError(`The group was made, but your saves couldn't be lined up for tagging: ${answer.fillError}`);
      },
    });

  const setHidden = (target, hidden, done = close) =>
    act(send(`/api/tag-groups/${target.key}`, "PATCH", { hidden }), { failure: "Couldn't change that group", done });

  // Off one tab, or off all of them.
  const hideOn = (target, k) =>
    k && target.kinds.length > 1
      ? act(send(`/api/tag-groups/${target.key}`, "PATCH", { kinds: target.kinds.filter((x) => x !== k) }), {
          failure: "Couldn't change that group",
          done: close,
        })
      : setHidden(target, true);

  async function show(target, k) {
    if (target.hidden && !target.built_in && full) return setDialog({ type: "limit" });
    setError(null);
    const problem = target.hidden
      ? await setHidden(target, false)
      : await act(send(`/api/tag-groups/${target.key}`, "PATCH", { kinds: [...target.kinds, k] }), {
          failure: "Couldn't change that group",
        });
    if (problem) setError(problem);
  }

  const removeGroup = (target) =>
    act(send(`/api/tag-groups/${target.key}`, "DELETE"), {
      failure: "Couldn't delete that group",
      done: () => {
        setDialog(null);
        setCurrent(null);
      },
    });

  const uses = (list) => list.reduce((n, t) => n + (t.usage_count || 0), 0);

  return (
    <>
      <UtilityBar onError={setError} />

      <main className="page page-wide">
        <div className="top-nav">
          <h1>Tags</h1>
        </div>

        <p className="tag-page-note">
          Tags appear as you save things. Rename one and everything wearing it follows, and the AI uses your word from
          then on.
        </p>

        {error && <p className="error">{error}</p>}

        {/* Stays until you undo it or leave the page. A toast that fades after
            five seconds is no use for a change you only notice was wrong once
            you go looking for the word. */}
        {undo && (
          <div className="tag-undo" role="status">
            <span>
              Merged <strong>{undo.from.join(", ")}</strong> into <strong>{undo.into}</strong>.{" "}
              {undo.moved ? `${plural(undo.moved, "save")} moved.` : "No saves needed moving."}
            </span>
            <button className="link-btn" onClick={undoMerge} disabled={undoing} aria-busy={undoing}>
              {undoing ? "Undoing…" : "Undo"}
            </button>
          </div>
        )}

        {pending.length > 0 && (
          <section className="tag-section tag-pending">
            <h2>New from the AI ({pending.length})</h2>
            <div className="tag-list">
              {pending.map((tag) => (
                <div className="tag-row" key={tag.id}>
                  <span className="tag-facet">{groups.find((g) => g.key === tag.facet)?.label}</span>
                  <span className="tag-label">{tag.label}</span>
                  <div className="tag-actions">
                    <button onClick={() => approve([tag])}>Approve</button>
                    <button className="danger-btn" onClick={() => setDialog({ type: "delete", tags: [tag] })}>
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!data && !error && <p className="empty-small">Loading tags…</p>}

        {group && (
          <div className="tag-layout">
            <nav className="tag-rail" aria-label="Tag groups" ref={railRef}>
              {/* A phone gets the tabs as tabs: one strip of every group would
                  say Industry three times with nothing to tell them apart. */}
              <div className="tag-rail-tabs">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    className={section.id === place.section ? "active" : ""}
                    aria-pressed={section.id === place.section}
                    onClick={() => open(section.items[0].group.key, section.items[0].kind)}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
              {sections.map((section) => (
                <div
                  className={`tag-rail-section${section.id === place.section ? " current" : ""}${opened.has(section.id) ? " open" : ""}`}
                  key={section.id}
                >
                  <h2>
                    <button
                      className="tag-rail-head"
                      aria-expanded={opened.has(section.id)}
                      onClick={() => toggleSection(section.id)}
                    >
                      <section.Icon size={16} aria-hidden="true" />
                      {section.label}
                      <ChevronDown className="tag-rail-chevron" size={16} aria-hidden="true" />
                    </button>
                  </h2>
                  <div className="tag-rail-fold">
                    <div>
                      {section.items.map((item) => {
                        const here = section.id === place.section && item.group.key === group.key && item.kind === place.kind;
                        return (
                          <button
                            key={`${item.group.key}:${item.kind}`}
                            className={`tag-rail-item${here ? " active" : ""}`}
                            aria-current={here ? "true" : undefined}
                            onClick={() => open(item.group.key, item.kind)}
                          >
                            <span>
                              {item.group.label}
                              {item.off && <small> on {kindLabel(item.kind)}</small>}
                            </span>
                            <span className="tag-rail-count">{tagsOn(item) || ""}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
              <div className="tag-rail-foot">
                <button className="tag-rail-new" onClick={newGroup}>
                  <Plus size={15} />
                  New Group
                </button>
              </div>
            </nav>

            <section className="tag-panel" aria-label={group.label}>
              <header className="tag-panel-head">
                {/* Beside the name rather than at the far edge: on a wide
                    screen that was a thousand pixels from what they act on. */}
                <div className="tag-panel-title">
                  <h2>{group.label}</h2>
                  {!group.locked && (
                    <div className="tag-actions">
                      <button onClick={() => setDialog({ type: "group", group })}>
                        <Pencil size={14} /> Edit
                      </button>
                      {hiddenHere ? (
                        <button onClick={() => show(group, kind)}>
                          <Eye size={14} /> Show Again
                        </button>
                      ) : (
                        <button onClick={() => setDialog({ type: "hide" })}>
                          <EyeOff size={14} /> Hide
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </header>

              {hiddenHere && (
                <p className="tag-panel-state">
                  {place.off ? `Hidden on ${kindLabel(kind)}.` : "Hidden."} It isn&rsquo;t in the filters or on your saves
                  there, and the AI leaves it alone. Its tags are kept.
                </p>
              )}
              {group.fill?.state === "queued" && !group.hidden && (
                <p className="tag-panel-state">
                  Tagging what you already had: {group.fill.done} of {group.fill.total}.
                </p>
              )}
              {group.fill?.state === "failed" && (
                <p className="tag-panel-state">
                  Tagging what you already had stopped at {group.fill.done} of {group.fill.total}. New saves are still
                  tagged.
                </p>
              )}

              {shownTags.length > 1 && (
                <p className="tag-hint">
                  <span className="tag-hint-drag">Drag a tag onto another to merge them, or select a few.</span>
                  <span className="tag-hint-tap">Tap tags to select them, then merge, rename or delete.</span>
                </p>
              )}

              <TagBoard
                key={`${place.section}:${group.key}`}
                families={familiesOf(shownTags, group)}
                empty={shownTags.length === 0}
                selected={selected}
                onToggle={toggle}
                onMerge={(ids, targetId) => merge([...ids, targetId].map(byId).filter(Boolean))}
                onAdd={addTag}
              />

              {picked.length > 0 && (
                <div className="tag-bar">
                  <span className="tag-bar-count">
                    {picked.length === 1 ? picked[0].label : `${picked.length} tags`}
                  </span>
                  <div className="tag-actions">
                    {picked.some((t) => !t.is_approved) && <button onClick={() => approve(picked.filter((t) => !t.is_approved))}>Approve</button>}
                    {picked.length === 1 && <button onClick={() => setDialog({ type: "rename", tag: picked[0] })}>Rename</button>}
                    {picked.length > 1 && (
                      <button className="primary" onClick={() => merge(picked)}>
                        Merge
                      </button>
                    )}
                    <button className="danger-btn" onClick={() => setDialog({ type: "delete", tags: picked })}>
                      Delete
                    </button>
                    <button className="link-btn" onClick={() => setSelected(new Set())}>
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {dialog?.type === "merge" && (
        <MergeDialog
          key={dialog.tags.map((t) => t.id).join()}
          tags={dialog.tags}
          onMerge={confirmMerge}
          onClose={close}
        />
      )}
      {dialog?.type === "rename" && (
        <RenameDialog tag={dialog.tag} onRename={(label) => rename(dialog.tag, label)} onClose={close} />
      )}
      {dialog?.type === "delete" && (
        <ConfirmDialog
          title={dialog.tags.length === 1 ? `Delete ${dialog.tags[0].label}?` : `Delete ${dialog.tags.length} tags?`}
          action="Delete"
          working="Deleting…"
          danger
          onConfirm={() => removeTags(dialog.tags)}
          onClose={close}
        >
          <p className="tag-dialog-note">
            {!uses(dialog.tags)
              ? `Nothing is tagged with ${dialog.tags.length === 1 ? "it" : "them"}.`
              : dialog.tags.length === 1
                ? `It comes off ${countsByKind(dialog.tags[0].counts)}, which keep everything else they're tagged with.`
                : `They're used ${plural(uses(dialog.tags), "time")} across your library. Those saves keep everything else they're tagged with.`}{" "}
            This can&rsquo;t be undone.
          </p>
        </ConfirmDialog>
      )}
      {dialog?.type === "hide" && group && (
        <ConfirmDialog
          title={`Hide ${group.label}?`}
          action={kind && group.kinds.length > 1 ? `Hide on ${kindLabel(kind)}` : "Hide Group"}
          working="Hiding…"
          alternative={
            kind && group.kinds.length > 1
              ? { label: "Hide Everywhere", run: () => setHidden(group, true) }
              : null
          }
          onConfirm={() => hideOn(group, kind)}
          onClose={close}
        >
          <p className="tag-dialog-note">
            It leaves the filters and the saves there, and the AI stops filling it in.
            {kind && group.kinds.length > 1 && ` It's also on ${kindList(group.kinds.filter((k) => k !== kind))}.`}
          </p>
          <p className="tag-dialog-note">
            Nothing is deleted. Its tags stay on everything they&rsquo;re on, and you can show it again whenever you like.
          </p>
        </ConfirmDialog>
      )}
      {dialog?.type === "deleteGroup" && (
        <ConfirmDialog
          title={`Delete ${dialog.group.label} for good?`}
          action="Delete Group"
          working="Deleting…"
          danger
          extra={
            !dialog.group.hidden && <button onClick={() => setDialog({ type: "hide" })}>Hide Instead</button>
          }
          onConfirm={() => removeGroup(dialog.group)}
          onClose={close}
        >
          <p className="tag-dialog-note">
            {plural(groupTags.length, "tag")} {groupTags.length === 1 ? "goes" : "go"} with it
            {uses(groupTags) ? `, off ${plural(uses(groupTags), "place")} they're used` : ""}. The saves themselves stay,
            with everything else they&rsquo;re tagged with. This can&rsquo;t be undone.
          </p>
        </ConfirmDialog>
      )}
      {dialog?.type === "group" && (
        <GroupDialog
          group={dialog.group}
          groups={groups}
          sizes={data.sizes}
          startOn={kind}
          onSave={saveGroup(dialog.group)}
          onDelete={() => setDialog({ type: "deleteGroup", group: dialog.group })}
          onClose={close}
        />
      )}
      {dialog?.type === "limit" && (
        <LimitDialog
          groups={groups}
          tags={tags}
          wanted={dialog.then === "new" ? () => setDialog({ type: "group" }) : null}
          onHide={(g) => setHidden(g, true, () => {})}
          onClose={close}
        />
      )}
      <SiteFooter />
    </>
  );
}
