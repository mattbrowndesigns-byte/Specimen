"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Pencil, Plus } from "lucide-react";
import UtilityBar from "../_ui/UtilityBar";
import SiteFooter from "../_ui/SiteFooter";
import TagBoard, { familiesOf } from "../_ui/TagBoard";
import { ConfirmDialog, GroupDialog, LimitDialog, MergeDialog, RenameDialog, plural } from "../_ui/TagDialogs";
import { CUSTOM_LIMIT, GROUP_KINDS, customInUse, kindList } from "@/lib/tagGroups";

// The vocabulary, and the one place it's tidied.
//
// Groups on the left, one group's tags on the right. It was every tag in the
// library as a full-width row: 158 of them, three buttons each, 9,830 pixels,
// and nothing saying which library a group was for or how often a tag was used.
//
// The groups are sorted by where they're used rather than put behind a tab per
// library, because Industry and Aesthetic are shared. Merging Minimal under a
// tab called Websites would have changed three hundred visuals and not said so.
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

// The rail's headings: everything used on more than one library is Shared, and
// the rest is under the library it's for.
function railSections(groups) {
  const shown = groups.filter((g) => !g.hidden);
  const web = (g) => g.kinds.every((k) => k === "site" || k === "component");
  const title = (g) => (g.kinds.length === 1 ? kindList(g.kinds, "label") : web(g) ? "Websites and Components" : "Shared");
  const order = ["Shared", "Websites and Components", ...GROUP_KINDS.map((k) => k.label)];
  return [
    ...order.map((name) => ({ name, groups: shown.filter((g) => title(g) === name) })),
    { name: "Hidden", groups: groups.filter((g) => g.hidden) },
  ].filter((section) => section.groups.length);
}

export default function TagsPage() {
  const [data, setData] = useState(null); // { groups, tags, sizes }
  const [error, setError] = useState(null);
  const [current, setCurrent] = useState(null);
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
  const group = groups.find((g) => g.key === current) || sections[0]?.groups[0];
  // Sorted here as well as in the query, where the database's alphabet puts
  // CTA before Card.
  const groupTags = useMemo(
    () => tags.filter((t) => t.facet === group?.key).sort((a, b) => a.label.localeCompare(b.label)),
    [tags, group]
  );
  const pending = tags.filter((t) => !t.is_approved && groups.some((g) => g.key === t.facet && !g.hidden));
  const picked = groupTags.filter((t) => selected.has(t.id));
  const close = useCallback(() => setDialog(null), []);

  function open(key) {
    setCurrent(key);
    setSelected(new Set());
  }

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
    const problem = await act(send("/api/tags", "POST", { facet: group.key, label }), { failure: "Couldn't add that tag" });
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
        if (answer.key) open(answer.key);
        if (answer.fillError) setError(`The group was made, but your saves couldn't be lined up for tagging: ${answer.fillError}`);
      },
    });

  const setHidden = (target, hidden, done = close) =>
    act(send(`/api/tag-groups/${target.key}`, "PATCH", { hidden }), { failure: "Couldn't change that group", done });

  async function show(target) {
    if (!target.built_in && full) return setDialog({ type: "limit" });
    setError(null);
    const problem = await setHidden(target, false);
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
          Every tag in your library, by group. Rename one and everything wearing it follows. The AI picks from these, so
          tidying here is how you teach it.
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
            <button className="link-btn" onClick={undoMerge} disabled={undoing}>
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
            <nav className="tag-rail" aria-label="Tag groups">
              {sections.map((section) => (
                <div className="tag-rail-section" key={section.name}>
                  <h2>{section.name}</h2>
                  {section.groups.map((g) => (
                    <button
                      key={g.key}
                      className={`tag-rail-item${g.key === group.key ? " active" : ""}`}
                      aria-current={g.key === group.key ? "true" : undefined}
                      onClick={() => open(g.key)}
                    >
                      <span>{g.label}</span>
                      <span className="tag-rail-count">{tags.filter((t) => t.facet === g.key).length}</span>
                    </button>
                  ))}
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
                      {group.hidden ? (
                        <button onClick={() => show(group)}>
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
                <p>
                  {group.question && <>{group.question} </>}
                  Used on {kindList(group.kinds)}.
                  {group.filled_by === "me" && " You fill this one in."}
                </p>
              </header>

              {group.hidden && (
                <p className="tag-panel-state">
                  Hidden. It isn&rsquo;t in your filters or on your saves, and the AI leaves it alone. Its tags are kept.
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

              {groupTags.length > 1 && (
                <p className="tag-hint">
                  <span className="tag-hint-drag">Drag a tag onto another to merge them, or select a few.</span>
                  <span className="tag-hint-tap">Tap tags to select them, then merge, rename or delete.</span>
                </p>
              )}

              <TagBoard
                tags={groupTags}
                families={familiesOf(groupTags, group)}
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
            {uses(dialog.tags)
              ? `${dialog.tags.length === 1 ? "It comes" : "They come"} off ${plural(uses(dialog.tags), "save")}, which keep everything else they're tagged with. This can't be undone.`
              : `Nothing is tagged with ${dialog.tags.length === 1 ? "it" : "them"}. This can't be undone.`}
          </p>
        </ConfirmDialog>
      )}
      {dialog?.type === "hide" && group && (
        <ConfirmDialog
          title={`Hide ${group.label}?`}
          action="Hide Group"
          working="Hiding…"
          onConfirm={() => setHidden(group, true)}
          onClose={close}
        >
          <p className="tag-dialog-note">
            It leaves the filters and the detail pages of your {kindList(group.kinds)}, and the AI stops filling it in.
          </p>
          <p className="tag-dialog-note">
            Nothing is deleted. {plural(groupTags.length, "tag")} and {plural(uses(groupTags), "use")} of them are kept,
            and you can show the group again whenever you like.
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
