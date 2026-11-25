"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import ModalShell from "./ModalShell";
import {
  CUSTOM_LIMIT,
  GROUP_KINDS,
  LABEL_MAX,
  countsByKind,
  customInUse,
  fillEstimate,
  kindList,
  slugify,
} from "@/lib/tagGroups";

// The Tags page's dialogs. Each does one thing and hands the answer back; the
// page makes the request, because the page is what has to be read again after.

export const plural = (n, one, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function Dialog({ title, onClose, children, foot }) {
  return (
    <ModalShell label={title} className="tag-dialog" onClose={onClose}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
      <div className="modal-foot">{foot}</div>
    </ModalShell>
  );
}

// An action that runs, shows itself running, and says what went wrong.
function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function run(work) {
    setBusy(true);
    setError(null);
    const problem = await work().catch(() => "Couldn't reach the server");
    setBusy(false);
    if (problem) setError(problem);
  }
  return { busy, error, setError, run };
}

// `tags` in the order they were chosen, the one dropped on last.
export function MergeDialog({ tags, onMerge, onClose }) {
  const byUse = [...tags].sort(
    (a, b) => (b.usage_count || 0) - (a.usage_count || 0) || tags.indexOf(b) - tags.indexOf(a)
  );
  const [name, setName] = useState(byUse[0].label);
  const [preview, setPreview] = useState(null);
  const { busy, error, setError, run } = useAction();
  const ids = tags.map((t) => t.id).join(",");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tags/merge?ids=${ids}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => !cancelled && data && setPreview(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ids]);

  function submit() {
    const label = name.trim();
    if (!label) return setError("Give it a name.");
    const target = tags.find((t) => slugify(t.label) === slugify(label)) || byUse[0];
    run(() => onMerge(tags.filter((t) => t.id !== target.id), target, label));
  }

  return (
    <Dialog
      title={`Merge ${plural(tags.length, "tag")}?`}
      onClose={onClose}
      foot={
        <>
          <button onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="modal-apply" onClick={submit} disabled={busy}>
            {busy ? "Merging…" : "Merge"}
          </button>
        </>
      }
    >
      {error && <p className="error">{error}</p>}
      <div className="field">
        <span>Keep the name</span>
        <div className="tag-choices">
          {byUse.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className={`chip chip-filter${slugify(name) === slugify(tag.label) ? " chip-selected" : ""}`}
              onClick={() => setName(tag.label)}
            >
              {tag.label}
              <span className="chip-count">{tag.usage_count || 0}</span>
            </button>
          ))}
        </div>
        <input
          value={name}
          maxLength={60}
          aria-label="Name to keep"
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <small className="field-hint">Pick one, or type a new name.</small>
      </div>
      <p className="tag-dialog-note">
        {!preview
          ? "Counting the saves…"
          : preview.total
            ? `${countsByKind(preview.byKind)} will wear this one tag.`
            : "Nothing is tagged with these yet."}{" "}
        If the AI suggests a word you merged away, it uses this tag instead.
      </p>
    </Dialog>
  );
}

export function RenameDialog({ tag, onRename, onClose }) {
  const [name, setName] = useState(tag.label);
  const { busy, error, setError, run } = useAction();
  const submit = () => {
    if (!name.trim()) return setError("Give it a name.");
    run(() => onRename(name.trim()));
  };
  return (
    <Dialog
      title="Rename tag"
      onClose={onClose}
      foot={
        <>
          <button onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="modal-apply" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {error && <p className="error">{error}</p>}
      <label className="field">
        <span>Name</span>
        <input
          value={name}
          maxLength={60}
          autoFocus
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <small className="field-hint">
          {tag.usage_count ? `It changes on ${countsByKind(tag.counts)}.` : "Nothing is tagged with it yet."}
        </small>
      </label>
    </Dialog>
  );
}

export function ConfirmDialog({ title, children, action, working, danger, extra, alternative, onConfirm, onClose }) {
  const { busy, error, run } = useAction();
  return (
    <Dialog
      title={title}
      onClose={onClose}
      foot={
        <>
          <button onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <div className="tag-dialog-actions">
            {extra}
            {alternative && (
              <button onClick={() => run(alternative.run)} disabled={busy}>
                {alternative.label}
              </button>
            )}
            <button className={danger ? "danger-btn" : "modal-apply"} onClick={() => run(onConfirm)} disabled={busy}>
              {busy ? working : action}
            </button>
          </div>
        </>
      }
    >
      {error && <p className="error">{error}</p>}
      {children}
    </Dialog>
  );
}

// One spelling each, in the order they were typed. A paste can hold several.
function withWords(words, text) {
  const out = [...words];
  for (const part of text.split(/[,\n]/)) {
    const word = part.trim().slice(0, 60);
    if (slugify(word) && !out.some((w) => slugify(w) === slugify(word))) out.push(word);
  }
  return out;
}

// Words as pills: type one, press Enter, and it's a thing you can see and take
// off. A line of commas was a format to follow, and nothing said it had worked.
function PillInput({ words, typing, onWords, onTyping, placeholder }) {
  const inputRef = useRef(null);

  function add() {
    onWords(withWords(words, typing));
    onTyping("");
    inputRef.current?.focus();
  }

  return (
    <div className="combobox">
      <div className="combobox-field" onClick={() => inputRef.current?.focus()}>
        {words.map((word) => (
          <span className="combobox-chip" key={word}>
            {word}
            <button
              type="button"
              aria-label={`Remove ${word}`}
              onClick={(e) => {
                e.stopPropagation();
                onWords(words.filter((w) => w !== word));
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={typing}
          placeholder={placeholder}
          aria-label="Add a tag"
          onChange={(e) => {
            const value = e.target.value;
            if (!/[,\n]/.test(value)) return onTyping(value);
            onWords(withWords(words, value));
            onTyping("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            } else if (e.key === "Backspace" && !typing && words.length) {
              onWords(words.slice(0, -1));
            }
          }}
        />
        {typing.trim() && (
          <button type="button" className="pill-add" onClick={add}>
            Add
          </button>
        )}
      </div>
    </div>
  );
}

// Making a group, or changing one. `group` is the one being changed.
export function GroupDialog({ group, groups, sizes, startOn, onSave, onDelete, onClose }) {
  const [label, setLabel] = useState(group?.label || "");
  const [kinds, setKinds] = useState(new Set(group?.kinds || (startOn ? [startOn] : [])));
  const [filledBy, setFilledBy] = useState(group?.filled_by || "ai");
  const [words, setWords] = useState([]);
  // Typed and not yet a pill. Pressing Create means it too.
  const [typing, setTyping] = useState("");
  const [fill, setFill] = useState(false);
  const { busy, error, setError, run } = useAction();

  const own = !group?.built_in;
  const offered = GROUP_KINDS.filter((k) => !group || group.all_kinds.includes(k.id));
  const chosen = offered.filter((k) => kinds.has(k.id)).map((k) => k.id);
  const starting = withWords(words, typing);
  const saved = chosen.reduce((n, k) => n + (sizes[k] || 0), 0);
  const savedOf = Object.fromEntries(chosen.map((k) => [k, sizes[k] || 0]));
  const ai = filledBy === "ai";

  const change = (set) => (value) => {
    set(value);
    setError(null);
  };

  function submit() {
    if (!label.trim()) return setError("Give the group a name.");
    if (!chosen.length) return setError("Pick at least one library to use it on.");
    if (!group && ai && starting.length < 2) {
      return setError("Add at least two tags, so the AI has something to choose between.");
    }
    run(() =>
      onSave({
        label: label.trim(),
        kinds: chosen,
        ...(own ? { filled_by: filledBy } : {}),
        ...(group ? {} : { tags: starting, fill: ai && fill && saved > 0 }),
      })
    );
  }

  return (
    <Dialog
      title={group ? "Edit group" : "New group"}
      onClose={onClose}
      foot={
        <>
          {group && own ? (
            <button className="danger-btn" onClick={onDelete} disabled={busy}>
              Delete Group
            </button>
          ) : (
            <button onClick={onClose} disabled={busy}>
              Cancel
            </button>
          )}
          <button className="modal-apply" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : group ? "Save" : "Create Group"}
          </button>
        </>
      }
    >
      {error && <p className="error">{error}</p>}

      <label className="field">
        <span>Name</span>
        <input
          value={label}
          maxLength={LABEL_MAX}
          placeholder="Platform"
          autoFocus={!group}
          onChange={(e) => change(setLabel)(e.target.value)}
        />
      </label>

      {!group && (
        <div className="field">
          <span>Tags</span>
          <PillInput
            words={words}
            typing={typing}
            onWords={change(setWords)}
            onTyping={change(setTyping)}
            placeholder={words.length ? "Add another" : "iOS"}
          />
          <small className="field-hint">Press Enter after each one. You can add more any time.</small>
        </div>
      )}

      {offered.length > 1 && (
        <div className="field">
          <span>Use it on</span>
          <div className="tag-choices">
            {offered.map((kind) => (
              <button
                key={kind.id}
                type="button"
                aria-pressed={kinds.has(kind.id)}
                className={`chip chip-filter${kinds.has(kind.id) ? " chip-selected" : ""}`}
                onClick={() => {
                  change(setKinds)((prev) => {
                    const next = new Set(prev);
                    if (next.has(kind.id)) next.delete(kind.id);
                    else next.add(kind.id);
                    return next;
                  });
                }}
              >
                {kind.label}
              </button>
            ))}
          </div>
          {group && group.kinds.some((k) => !kinds.has(k)) && (
            <small className="field-hint">
              Taking it off {kindList(group.kinds.filter((k) => !kinds.has(k)))} hides it there. The tags stay, and come
              back if you turn it on again.
            </small>
          )}
        </div>
      )}

      {own && (
        <div className="tag-ai-choices">
          <label className="tag-fill-choice">
            <input
              type="checkbox"
              className="select-box"
              checked={ai}
              onChange={(e) => change(setFilledBy)(e.target.checked ? "ai" : "me")}
            />
            <span>
              Let the AI tag new saves
              <small className="field-hint">
                {ai
                  ? "It uses one of these tags when it fits, and skips the save when none do."
                  : "You’ll add these tags yourself. They stay off your share links, like notes."}
              </small>
            </span>
          </label>

          {!group && ai && saved > 0 && (
            <label className="tag-fill-choice">
              <input type="checkbox" className="select-box" checked={fill} onChange={(e) => setFill(e.target.checked)} />
              <span>
                Check the {countsByKind(savedOf)} I already have
                <small className="field-hint">
                  Only the ones that fit get a tag. It happens in the background {fillEstimate(chosen, sizes)}.
                </small>
              </span>
            </label>
          )}
        </div>
      )}

      {!group && (
        <p className="tag-dialog-count">
          You can hide a group any time without losing its tags. {customInUse(groups).length} of {CUSTOM_LIMIT} used.
        </p>
      )}
    </Dialog>
  );
}

// Asking for a sixth. It's the moment the question is worth asking, so it
// lists what there is and lets one go from here.
export function LimitDialog({ groups, tags, wanted, onHide, onClose }) {
  const { busy, error, run } = useAction();
  const own = customInUse(groups);
  const room = own.length < CUSTOM_LIMIT;
  return (
    <Dialog
      title={room ? "There's room now" : `You have ${CUSTOM_LIMIT} groups of your own`}
      onClose={onClose}
      foot={
        <button className="modal-apply tag-dialog-only" onClick={room && wanted ? wanted : onClose}>
          {room && wanted ? "Continue" : "Done"}
        </button>
      }
    >
      {error && <p className="error">{error}</p>}
      <p className="tag-dialog-note">
        {room
          ? `You're using ${own.length} of ${CUSTOM_LIMIT}, so you can make another. Keep going only if it's a question you'd really filter by.`
          : "That's the limit for now. The AI weighs every group on every save, so fewer keeps its picks sharp, and a library sorted too many ways gets harder to find things in, not easier. Is there one you could do without?"}
      </p>
      <ul className="tag-limit-list">
        {own.map((group) => {
          const list = tags.filter((t) => t.facet === group.key);
          const uses = list.reduce((n, t) => n + (t.usage_count || 0), 0);
          return (
            <li key={group.key}>
              <span>
                <strong>{group.label}</strong>
                <small>
                  {plural(list.length, "tag")}, {uses ? `used ${plural(uses, "time")}` : "not used yet"}
                </small>
              </span>
              <button onClick={() => run(() => onHide(group))} disabled={busy}>
                Hide
              </button>
            </li>
          );
        })}
      </ul>
      <small className="field-hint">Hiding one keeps its tags, and you can bring it back when there&rsquo;s room.</small>
    </Dialog>
  );
}
