"use client";
import { useRef } from "react";
import { Search } from "lucide-react";

// A filled pill with the magnifier in a circle at the end, rather than a
// bordered box.
//
// The circle focuses the field and does not submit, because there is nothing
// to submit to: every search in this app filters as you type, so a button that
// ran the search would be a control claiming work that had already happened.
// What it does instead is label the field and give it a target you can hit
// without aiming -- which is the whole of what a magnifier in a search box has
// ever really been for.
export default function SearchField({ value, onChange, placeholder }) {
  const inputRef = useRef(null);

  return (
    <div className="search-field">
      <input
        ref={inputRef}
        type="search"
        className="search-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="search-go"
        onClick={() => inputRef.current?.focus()}
        aria-label="Search"
      >
        <Search size={17} />
      </button>
    </div>
  );
}
