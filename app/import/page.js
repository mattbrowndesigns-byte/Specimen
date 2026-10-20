"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Globe, Wrench, Upload } from "lucide-react";
import UtilityBar from "../_ui/UtilityBar";
import SiteFooter from "../_ui/SiteFooter";
import ImportStatus from "../_ui/ImportStatus";
import { parseLinks } from "@/lib/importLinks";

// Bringing a bookmarking app's worth of links across in one paste.
//
// It lives in the menu rather than in the bar because it is a thing you do
// once, on the day you decide to stop using the other app. The bar is for what
// you reach for daily.
//
// The whole design question here is what to promise. A hundred sites is a
// hundred screenshots and two hundred model calls against a free tier that
// allows sixty a day, so this cannot say "importing" and show a spinner --
// it finishes over days, not minutes. What it says instead is exactly where
// each pile is, and that closing the tab changes nothing.
const KINDS = [
  {
    id: "site",
    label: "Websites",
    Icon: Globe,
    note: "Each one gets a full page screenshot, a summary and tags.",
  },
  {
    id: "resource",
    label: "Resources",
    Icon: Wrench,
    note: "Links saved for what they do. No screenshot, so these land fast.",
  },
];

const MAX_CHARS = 2_000_000;

export default function ImportPage() {
  const [kind, setKind] = useState("site");
  const [text, setText] = useState("");
  const [chosenFolders, setChosenFolders] = useState([]);
  const [parsed, setParsed] = useState(null);
  const [account, setAccount] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  const loadAccount = useCallback(async () => {
    const res = await fetch("/api/import");
    if (res.ok) setAccount(await res.json());
  }, []);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  // Parsed in the browser purely so the preview is instant. The route parses
  // the same text again with the same function, because a list posted from a
  // page is a list from the outside world.
  useEffect(() => {
    if (!text.trim()) {
      setParsed(null);
      setChosenFolders([]);
      return;
    }
    const next = parseLinks(text);
    setParsed(next);
    setChosenFolders((current) => current.filter((f) => next.folders.includes(f)));
  }, [text]);

  function readFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      setError(value.length > MAX_CHARS ? "That file is too big to read in one go." : null);
      setText(value.slice(0, MAX_CHARS));
      setResult(null);
    };
    reader.readAsText(file);
  }

  const selected = chosenFolders.length ? chosenFolders : null;
  const items = parsed
    ? selected
      ? parsed.items.filter((i) => selected.includes(i.folder))
      : parsed.items
    : [];

  async function runImport() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, kind, folders: selected || [] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "That import didn't go through.");
        return;
      }
      setResult(data);
      setText("");
      await loadAccount();
    } catch {
      setError("That import didn't go through.");
    } finally {
      setBusy(false);
    }
  }

  const kindInfo = KINDS.find((k) => k.id === kind);
  const overLimit =
    kind === "site" && account && items.length > account.remaining ? items.length - account.remaining : 0;

  return (
    <>
      <UtilityBar onError={setError} />

      <main className="page page-wide">
        <div className="top-nav">
          <h1>Import Links</h1>
        </div>

        <p className="tag-page-note">
          Paste a list of URLs, or drop the file your bookmarking app exported. Kivli reads Raindrop
          CSV, bookmark HTML and a plain list of links. Everything is captured and tagged in the
          background, so you can close this tab.
        </p>

        {error && <p className="error">{error}</p>}

        <ImportStatus account={account} onRefresh={loadAccount} />

        <section className="import-panel">
          <div className="import-kind">
            <div className="view-switch" role="group" aria-label="What kind of links are these">
              {KINDS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={kind === id ? "active" : ""}
                  aria-pressed={kind === id}
                  onClick={() => setKind(id)}
                >
                  <Icon size={15} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
            <p className="import-kind-note">{kindInfo.note}</p>
          </div>

          <label className="import-drop-label" htmlFor="import-text">
            Your links
          </label>
          <div
            className={`import-drop${dragging ? " import-drop-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              readFile(e.dataTransfer.files?.[0]);
            }}
          >
            <textarea
              id="import-text"
              className="import-textarea"
              value={text}
              spellCheck={false}
              onChange={(e) => {
                setText(e.target.value.slice(0, MAX_CHARS));
                setResult(null);
              }}
              placeholder={"https://stripe.com\nhttps://linear.app\nhttps://lucide.dev"}
            />
            <div className="import-drop-foot">
              <button type="button" className="link-btn" onClick={() => fileRef.current?.click()}>
                <Upload size={14} aria-hidden="true" />
                Choose a file
              </button>
              <span className="import-drop-hint">or drag one in</span>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.html,.htm,.txt,text/csv,text/html,text/plain"
                className="import-file-input"
                onChange={(e) => {
                  readFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          {/* Folders are what makes the websites/resources decision tractable
              without a model guessing at it. An export from Raindrop already
              knows that one pile is inspiration and the other is tools; this
              just lets you bring them over one pile at a time. */}
          {parsed?.folders.length > 0 && (
            <div className="import-folders">
              <span className="import-folders-label">Folders in that file</span>
              <div className="import-folder-chips">
                {parsed.folders.map((folder) => {
                  const on = chosenFolders.includes(folder);
                  const count = parsed.items.filter((i) => i.folder === folder).length;
                  return (
                    <button
                      key={folder}
                      type="button"
                      className={`chip chip-filter${on ? " chip-selected" : ""}`}
                      aria-pressed={on}
                      onClick={() =>
                        setChosenFolders((current) =>
                          current.includes(folder)
                            ? current.filter((f) => f !== folder)
                            : [...current, folder]
                        )
                      }
                    >
                      {folder}
                      <span className="chip-count">{count}</span>
                    </button>
                  );
                })}
              </div>
              <p className="import-folders-hint">
                {chosenFolders.length
                  ? "Only the chosen folders will come across."
                  : "Nothing chosen, so all of them will come across."}
              </p>
            </div>
          )}

          {parsed && (
            <div className="import-preview">
              <p className="import-preview-count">
                <strong>{items.length}</strong> {items.length === 1 ? "link" : "links"} ready to
                import as {kind === "site" ? "websites" : "resources"}.
              </p>
              <ul className="import-preview-notes">
                {parsed.duplicates > 0 && (
                  <li>
                    {parsed.duplicates} {parsed.duplicates === 1 ? "link was" : "links were"} in
                    there twice and will come across once.
                  </li>
                )}
                {parsed.skipped > 0 && (
                  <li>
                    {parsed.skipped} {parsed.skipped === 1 ? "line wasn't" : "lines weren't"} a link
                    and will be left out.
                  </li>
                )}
                {overLimit > 0 && (
                  <li className="import-preview-warn">
                    Your account holds {account.limit} websites and you have {account.remaining}{" "}
                    left, so {overLimit} of these will be left out. Resources have no limit.
                  </li>
                )}
                <li>
                  Anything already in your library is skipped when the import runs, so bringing the
                  same file across twice is safe.
                </li>
              </ul>
            </div>
          )}

          <div className="import-actions">
            <button className="primary" disabled={!items.length || busy} onClick={runImport}>
              {busy
                ? "Importing..."
                : `Import ${items.length || ""} ${items.length === 1 ? "link" : "links"}`.trim()}
            </button>
          </div>

          {result && (
            <div className="import-result">
              <p>
                <strong>{result.created}</strong>{" "}
                {result.created === 1 ? "link is" : "links are"} in. They will fill in on their own
                from here, and the panel above tracks them.
              </p>
              <ul className="import-preview-notes">
                {result.alreadySaved > 0 && (
                  <li>{result.alreadySaved} were already in your library.</li>
                )}
                {result.limited > 0 && (
                  <li className="import-preview-warn">
                    {result.limited} were left out because the account is full.
                  </li>
                )}
              </ul>
            </div>
          )}
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
