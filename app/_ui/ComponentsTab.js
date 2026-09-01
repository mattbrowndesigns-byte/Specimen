"use client";
import { useEffect, useState } from "react";
import CropTool from "./CropTool";

export default function ComponentsTab() {
  const [components, setComponents] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [pendingCapture, setPendingCapture] = useState(null);
  const [saving, setSaving] = useState(false);

  async function loadComponents() {
    const res = await fetch("/api/components");
    if (res.ok) {
      const data = await res.json();
      setComponents(data.components || []);
    }
    setLoaded(true);
  }

  useEffect(() => {
    loadComponents();
  }, []);

  useEffect(() => {
    if (!pendingCapture || pendingCapture.status !== "pending") return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/components/capture/${pendingCapture.id}`);
      if (res.ok) {
        const data = await res.json();
        setPendingCapture(data.capture);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [pendingCapture]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!url.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/components/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      setPendingCapture(data.capture);
      setUrl("");
    } catch {
      setError("Couldn't reach the server");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveCrop(cropRect) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/components", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ componentCaptureId: pendingCapture.id, cropRect }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save component");
        return;
      }
      setPendingCapture(null);
      setComponents((prev) => [data.component, ...prev]);
    } catch {
      setError("Couldn't reach the server");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <form className="save-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Paste a page URL to crop a component from…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={submitting || !!pendingCapture}
        />
        <button type="submit" disabled={submitting || !!pendingCapture}>
          {submitting ? "Starting…" : "Capture"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {pendingCapture && pendingCapture.status === "pending" && (
        <p className="empty">Capturing the page… this takes about a minute.</p>
      )}

      {pendingCapture && pendingCapture.status === "failed" && (
        <p className="error">
          That page couldn't be captured.{" "}
          <button onClick={() => setPendingCapture(null)}>Try another URL</button>
        </p>
      )}

      {pendingCapture && pendingCapture.status === "ready" && (
        <CropTool
          imageUrl={pendingCapture.full_url}
          onCancel={() => setPendingCapture(null)}
          onSave={handleSaveCrop}
          saving={saving}
        />
      )}

      {!pendingCapture && loaded && components.length === 0 && (
        <p className="empty">Paste a page URL above to crop your first component.</p>
      )}

      {!pendingCapture && (
        <div className="grid">
          {components.map((c) => (
            <div className="card component-card" key={c.id}>
              <div className="thumb">
                {c.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image_url} alt={c.name || "Component"} />
                ) : (
                  <div className="placeholder">Processing…</div>
                )}
              </div>
              <div className="card-footer">
                <span className="name" title={c.summary || undefined}>
                  {c.name || "Untitled component"}
                </span>
                <a
                  className="visit"
                  href={c.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Visit source page"
                >
                  ↗
                </a>
              </div>
              {c.tags?.length > 0 && (
                <div className="card-tags">
                  {c.tags.map((tag, i) => (
                    <span className={`chip${tag.is_approved ? "" : " chip-pending"}`} key={i}>
                      {tag.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
