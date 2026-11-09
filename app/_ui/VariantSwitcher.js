"use client";
import { useEffect, useState } from "react";
import { Layers, X } from "lucide-react";
import { COMPARE_COOKIE, VARIANT_COOKIE, VARIANT_MAX_AGE, VARIANTS } from "@/lib/variant";

const MIN_KEY = "specimen.vswitch.min";

// A tool for comparing the three designs, not part of any of them. It shows in
// development always, and in production only once a browser has opened
// /demo-refined or /demo-elevated -- so a stranger following the LinkedIn link
// to /demo never sees it, and someone comparing never loses the way back.
//
// Switching rewrites the cookie and reloads the page you are on, so the same
// site, the same tab of the same URL, comes back in the other design. The tab
// you were on, the view and the sort are already remembered per browser, which
// is most of what "the equivalent place" means here.
//
// Rendered after mount only: whether to show depends on a cookie the server
// HTML can't see, and guessing would be a hydration mismatch.
export default function VariantSwitcher() {
  const [state, setState] = useState(null);

  useEffect(() => {
    const comparing = /(?:^|; )kivli_compare=1(?:;|$)/.test(document.cookie);
    if (process.env.NODE_ENV === "production" && !comparing) return;
    let min = false;
    try {
      min = localStorage.getItem(MIN_KEY) === "1";
    } catch {
      // No storage means it starts open, which is fine.
    }
    setState({ current: document.documentElement.dataset.variant || "original", min });
  }, []);

  if (!state) return null;

  function choose(id) {
    if (id === state.current) return;
    const secure = location.protocol === "https:" ? "; secure" : "";
    const common = `; path=/; max-age=${VARIANT_MAX_AGE}; samesite=lax${secure}`;
    document.cookie =
      id === "original" ? `${VARIANT_COOKIE}=; path=/; max-age=0` : `${VARIANT_COOKIE}=${id}${common}`;
    document.cookie = `${COMPARE_COOKIE}=1${common}`;
    location.reload();
  }

  function setMin(min) {
    setState((s) => ({ ...s, min }));
    try {
      localStorage.setItem(MIN_KEY, min ? "1" : "0");
    } catch {
      // Not remembering is survivable.
    }
  }

  if (state.min) {
    const label = VARIANTS.find((v) => v.id === state.current)?.label;
    return (
      <button
        type="button"
        className="vswitch vswitch-min"
        onClick={() => setMin(false)}
        aria-label={`Design: ${label}. Show the design switcher`}
        title="Compare designs"
      >
        <Layers size={14} />
        {label}
      </button>
    );
  }

  return (
    <div className="vswitch" role="group" aria-label="Compare designs">
      <span className="vswitch-label">
        <Layers size={13} />
        Design
      </span>
      <div className="vswitch-track">
        {VARIANTS.map((v) => (
          <button
            type="button"
            key={v.id}
            className={v.id === state.current ? "on" : ""}
            aria-pressed={v.id === state.current}
            onClick={() => choose(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>
      <button type="button" className="vswitch-close" onClick={() => setMin(true)} aria-label="Minimise">
        <X size={13} />
      </button>
    </div>
  );
}
