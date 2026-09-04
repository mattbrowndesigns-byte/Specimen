"use client";
import UtilityBar from "../_ui/UtilityBar";

// Placeholder. Linked from the menu so the slot exists; the copy comes later.
export default function AboutPage() {
  return (
    <>
      <UtilityBar />

      <main className="page page-wide">
        <div className="top-nav">
          <h1>About</h1>
        </div>
        <div className="placeholder-page">
          <p>
            Kivli is your visual inspiration library. Paste a URL and it captures the page on
            desktop and mobile, then tags and summarises it so you can find it again in seconds.
          </p>
          <p className="empty-small">This page is a placeholder — there&rsquo;s more to write here.</p>
        </div>
      </main>
    </>
  );
}
