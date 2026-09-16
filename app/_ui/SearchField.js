"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Clock, Trash2 } from "lucide-react";

// A filled pill with the magnifier in a circle at the end, and a panel of
// recent searches and completions under it.
//
// The circle focuses the field and does not submit, because there is nothing
// to submit to: every search in this app filters as you type, so a button that
// ran the search would be a control claiming work that had already happened.
// What it does is label the field and give it a target you can hit without
// aiming.
//
// The completions come from the library's own words -- its tag vocabulary
// first, then the names of the things in it -- and that is the whole
// difference between this and the search box it's modelled on. A site with
// millions of records can suggest "carousel" because somebody's carousel is
// certainly in there. A personal library of 150 saves cannot: a suggestion
// that returns nothing is worse than no suggestion at all, because it reads as
// a promise. So the only words offered are words that are in there.
//
// "Popular", by the same logic, is the tags with the most saves against them --
// which is both the honest analogue and the more useful one, since it answers
// "what is this library mostly about" on the way past.
//
// No combobox/listbox roles, deliberately. Doing that pattern properly needs
// `aria-activedescendant` pointing at options that may not contain interactive
// children -- and a recent row contains a delete button. What this actually is
// is a search box with a set of labelled buttons under it, which is reachable
// and announces correctly; claiming the richer pattern and implementing 80% of
// it would be worse than not claiming it.

const MAX_HISTORY = 8;
const MAX_RECENT_SHOWN = 5;
const MAX_ROWS = 8;

// One letter is not a search, it's a keystroke on the way to one. Remembering
// it would fill the list with the prefixes of the thing you actually looked for.
const MIN_REMEMBERED = 2;

function readHistory(key) {
  if (!key) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(raw)
      ? raw.filter((entry) => typeof entry === "string")
      : [];
  } catch {
    // A blocked or corrupt localStorage means no history, not a broken search.
    return [];
  }
}

function writeHistory(key, list) {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(0, MAX_HISTORY)));
  } catch {
    // Not being able to remember a search is not worth an error.
  }
}

// The part you typed stays regular and the rest goes bold, so the eye reads
// the completion rather than re-reading the word it already knows it typed.
function Completion({ label, match }) {
  const at = match ? label.toLowerCase().indexOf(match.toLowerCase()) : -1;
  if (at < 0) return <b>{label}</b>;
  return (
    <>
      {at > 0 && <b>{label.slice(0, at)}</b>}
      {label.slice(at, at + match.length)}
      <b>{label.slice(at + match.length)}</b>
    </>
  );
}

export default function SearchField({
  value,
  onChange,
  placeholder,
  historyKey,
  terms = [],
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [active, setActive] = useState(-1);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  // Choosing a suggestion puts focus back in the field, and focus is what
  // opens the panel -- so without this the panel reopens on the row you just
  // picked from. The flag lives for one tick, so a real focus straight
  // afterwards still opens it.
  const skipOpen = useRef(false);

  // Read once on mount. localStorage is the right home for this: a search
  // history is a per-device convenience, not library data, and a table for it
  // would want a user_id, RLS, a policy and a scoped query in every route that
  // touched it -- for a list nobody would miss if a browser lost it.
  useEffect(() => {
    setHistory(readHistory(historyKey));
  }, [historyKey]);

  const remember = useCallback(
    (term) => {
      const entry = term.trim();
      if (!historyKey || entry.length < MIN_REMEMBERED) return;
      setHistory((prev) => {
        const next = [
          entry,
          ...prev.filter((h) => h.toLowerCase() !== entry.toLowerCase()),
        ];
        writeHistory(historyKey, next);
        return next.slice(0, MAX_HISTORY);
      });
    },
    [historyKey],
  );

  const close = useCallback(() => {
    setOpen(false);
    setActive(-1);
    remember(value);
  }, [remember, value]);

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, close]);

  const query = value.trim().toLowerCase();

  const rows = useMemo(() => {
    const recent = history.filter(
      (entry) => !query || entry.toLowerCase().includes(query),
    );
    const taken = new Set(recent.map((entry) => entry.toLowerCase()));

    // A prefix match is what you were typing towards; a word that merely
    // contains the letters is a second guess, so it sorts after all of them.
    const starts = [];
    const contains = [];
    for (const term of terms) {
      const label = String(term?.label ?? term ?? "");
      if (!label || taken.has(label.toLowerCase())) continue;
      if (!query) starts.push(label);
      else if (label.toLowerCase().startsWith(query)) starts.push(label);
      else if (label.toLowerCase().includes(query)) contains.push(label);
    }

    const recentRows = recent
      .slice(0, MAX_RECENT_SHOWN)
      .map((label) => ({ label, recent: true }));
    const termRows = [...starts, ...contains]
      .slice(0, MAX_ROWS - recentRows.length)
      .map((label) => ({ label, recent: false }));

    return [...recentRows, ...termRows];
  }, [history, terms, query]);

  function choose(label) {
    onChange(label);
    remember(label);
    setOpen(false);
    setActive(-1);
    skipOpen.current = true;
    inputRef.current?.focus();
    setTimeout(() => {
      skipOpen.current = false;
    }, 0);
  }

  function forget(entry) {
    setHistory((prev) => {
      const next = prev.filter((h) => h !== entry);
      writeHistory(historyKey, next);
      return next;
    });
    // Deliberately stays open and leaves the query alone: deleting one line of
    // history is housekeeping, not a search.
    inputRef.current?.focus();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      close();
      return;
    }
    if (!rows.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % rows.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? rows.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (active >= 0 && rows[active]) {
        e.preventDefault();
        choose(rows[active].label);
      } else {
        close();
      }
    }
  }

  const showPop = open && rows.length > 0;

  return (
    <div
      className="search-field"
      ref={wrapRef}
      onBlur={(e) => {
        // Tab out of the field entirely and the panel goes with you. Moving
        // between the input, the circle and a row is not leaving.
        if (open && !wrapRef.current?.contains(e.relatedTarget)) close();
      }}
    >
      <input
        ref={inputRef}
        type="search"
        className="search-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => {
          if (skipOpen.current) return;
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />

      {/* Our own, because WebKit draws its native one underneath the circle.
          It only exists when there's something to clear. */}
      {value && (
        <button
          type="button"
          className="search-clear"
          // Keeps focus in the input. Without it Safari blurs the field on
          // mousedown without focusing the button, the panel closes on blur,
          // and the row unmounts before its own click can fire.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          aria-label="Clear the search"
        >
          <X size={16} />
        </button>
      )}

      <button
        type="button"
        className="search-go"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.focus()}
        aria-label="Search"
      >
        <Search size={17} />
      </button>

      {showPop && (
        <div className="search-pop" aria-label="Suggestions">
          {rows.map((row, i) => (
            <div
              className={`search-option${i === active ? " search-option-on" : ""}`}
              key={`${row.recent ? "r" : "s"}:${row.label}`}
            >
              <button
                type="button"
                className="search-option-pick"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(row.label)}
              >
                {row.recent ? <Clock size={15} /> : <Search size={15} />}
                <span className="search-option-label">
                  <Completion label={row.label} match={value.trim()} />
                </span>
              </button>
              {row.recent && (
                <button
                  type="button"
                  className="search-forget"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => forget(row.label)}
                  aria-label={`Forget "${row.label}"`}
                  title="Forget this search"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
