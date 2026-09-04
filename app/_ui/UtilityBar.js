"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import AddMenu from "./AddMenu";
import { addItem, jobHandoffUrl } from "@/lib/addItem";
import { THEME_KEY } from "@/lib/theme";

// The library's chrome, the same on every page: identity (which doubles as the
// way home), the review count, tag management and Add.
//
// The dashboard passes `onAdd` because it can show capture progress inline.
// Everywhere else, a save hands the job to the dashboard through the query
// string and navigates there, so you always end up watching the capture.
export default function UtilityBar({ onAdd, onError }) {
  const [needsReviewCount, setNeedsReviewCount] = useState(0);
  const [theme, setTheme] = useState("light");

  // The boot script in the document head has already set data-theme from
  // storage or the OS preference; read it back rather than deciding again.
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // The theme still applies for this session; it just won't be remembered.
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadCount() {
      const [sitesRes, componentsRes] = await Promise.all([
        fetch("/api/sites"),
        fetch("/api/components"),
      ]);
      let count = 0;
      if (sitesRes.ok) {
        const data = await sitesRes.json();
        count += (data.sites || []).filter((s) => s.needs_review).length;
      }
      if (componentsRes.ok) {
        const data = await componentsRes.json();
        count += (data.components || []).filter((c) => c.needs_review).length;
      }
      if (!cancelled) setNeedsReviewCount(count);
    }
    loadCount();
    const interval = setInterval(loadCount, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  async function handleAdd(kind, url) {
    if (onAdd) return onAdd(kind, url);
    const result = await addItem(kind, url);
    if (result.error) {
      onError?.(result.error);
      return false;
    }
    window.location.href = jobHandoffUrl(result.job);
    return true;
  }

  return (
    <header className="utility-bar">
      <div className="utility-bar-inner">
        <a className="utility-bar-title" href="/">
          <h1>Inspiration Library</h1>
        </a>
        <div className="nav-links">
          {needsReviewCount > 0 && (
            <a href="/review" className="review-badge">
              {needsReviewCount} to review
            </a>
          )}
          <a href="/tags">Manage tags</a>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <AddMenu onSubmit={handleAdd} />
        </div>
      </div>
    </header>
  );
}
