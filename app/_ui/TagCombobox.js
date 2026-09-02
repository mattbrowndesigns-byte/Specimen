"use client";
import { useMemo, useRef, useState } from "react";

// assigned: [{id, label, is_approved}]
// available: [{id, label, usage_count}] -- tags in this facet not yet assigned
export default function TagCombobox({ assigned, available, onAdd, onRemove, onCreate }) {
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const blurTimeout = useRef(null);

  const filtered = useMemo(() => {
    const q = inputValue.trim().toLowerCase();
    const matches = q ? available.filter((t) => t.label.toLowerCase().includes(q)) : available;
    return [...matches].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
  }, [available, inputValue]);

  const exactMatch = filtered.some((t) => t.label.toLowerCase() === inputValue.trim().toLowerCase());
  const showCreate = inputValue.trim().length > 0 && !exactMatch;

  function handleFocus() {
    clearTimeout(blurTimeout.current);
    setOpen(true);
  }

  function handleBlur() {
    blurTimeout.current = setTimeout(() => setOpen(false), 120);
  }

  async function pick(tag) {
    setBusy(true);
    await onAdd(tag.id);
    setBusy(false);
    setInputValue("");
    inputRef.current?.focus();
  }

  async function create() {
    const label = inputValue.trim();
    if (!label || busy) return;
    setBusy(true);
    await onCreate(label);
    setBusy(false);
    setInputValue("");
    inputRef.current?.focus();
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length > 0 && !showCreate) pick(filtered[0]);
      else if (showCreate) create();
    } else if (e.key === "Backspace" && inputValue === "" && assigned.length > 0) {
      onRemove(assigned[assigned.length - 1].id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="combobox" onBlur={handleBlur}>
      <div className="combobox-field" onClick={() => inputRef.current?.focus()}>
        {assigned.map((tag) => (
          <span className={`combobox-chip${tag.is_approved ? "" : " chip-pending"}`} key={tag.id}>
            {tag.label}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(tag.id);
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={assigned.length === 0 ? "Add tags…" : ""}
          disabled={busy}
        />
      </div>

      {open && (filtered.length > 0 || showCreate) && (
        <div className="combobox-dropdown">
          {filtered.map((tag) => (
            <button type="button" className="combobox-option" key={tag.id} onClick={() => pick(tag)}>
              <span>{tag.label}</span>
              {tag.usage_count > 0 && <span className="combobox-count">{tag.usage_count}</span>}
            </button>
          ))}
          {showCreate && (
            <button type="button" className="combobox-option combobox-create" onClick={create}>
              <span>{inputValue.trim()}</span>
              <span className="combobox-count">New tag</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
