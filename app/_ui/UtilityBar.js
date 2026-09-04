"use client";
import { useEffect, useState } from "react";
import AddMenu from "./AddMenu";
import { addItem, jobHandoffUrl } from "@/lib/addItem";

// The library's chrome, the same on every page: identity (which doubles as the
// way home), the review count, tag management and Add.
//
// The dashboard passes `onAdd` because it can show capture progress inline.
// Everywhere else, a save hands the job to the dashboard through the query
// string and navigates there, so you always end up watching the capture.
export default function UtilityBar({ onAdd, onError }) {
  const [needsReviewCount, setNeedsReviewCount] = useState(0);

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
          <AddMenu onSubmit={handleAdd} />
        </div>
      </div>
    </header>
  );
}
