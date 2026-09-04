"use client";
import UtilityBar from "../_ui/UtilityBar";

// Placeholder. Linked from the menu so the slot exists; the questions come later.
export default function FaqPage() {
  return (
    <>
      <UtilityBar />

      <main className="page page-wide">
        <div className="top-nav">
          <h1>FAQ</h1>
        </div>
        <div className="placeholder-page">
          <p className="empty-small">
            This page is a placeholder — nothing here yet.
          </p>
        </div>
      </main>
    </>
  );
}
