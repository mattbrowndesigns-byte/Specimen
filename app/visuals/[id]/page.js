"use client";
import { useEffect, useState, use as usePromise } from "react";
import UtilityBar from "../../_ui/UtilityBar";
import Lightbox from "../../_ui/Lightbox";
import { SEQUENCE_KEY } from "../../_ui/masonry";

// A visual's own address. From the board, a card opens the lightbox in
// place and only borrows this URL; this page is what a refresh, a pasted
// link or a new tab lands on -- the same lightbox, opened over the app, and
// closing it goes to the board.
//
// The walk order is what the board last showed (kept in sessionStorage when
// a card was opened), or the whole library when there isn't one.

function readSequence(id, library) {
  try {
    const ids = JSON.parse(sessionStorage.getItem(SEQUENCE_KEY) || "[]");
    if (Array.isArray(ids) && ids.includes(id)) return ids.filter((v) => library.some((item) => item.id === v));
  } catch {
    // Fall through to the library's order.
  }
  return library.map((v) => v.id);
}

export default function VisualPage({ params }) {
  const { id } = usePromise(params);
  const [library, setLibrary] = useState(null);
  const [error, setError] = useState(null);
  // Decided once, when the library arrives: deleting the opened visual moves
  // the lightbox on to the next one, and that must not unmount it.
  const [found, setFound] = useState(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/visuals");
      if (!res.ok) {
        setError("Couldn't load your visuals");
        return;
      }
      const visuals = (await res.json()).visuals || [];
      setLibrary(visuals);
      setFound(visuals.some((v) => v.id === id));
    })();
  }, [id]);

  return (
    <>
      <UtilityBar onError={setError} />
      <main className="page detail-page">
        {error && <p className="error">{error}</p>}
        {found === false && (
          <p>
            That visual isn&rsquo;t in your library. <a href="/?tab=visuals">Back to Visuals</a>
          </p>
        )}
      </main>
      {found && (
        <Lightbox
          items={library}
          sequence={readSequence(id, library)}
          startId={id}
          onClose={() => {
            window.location.href = "/?tab=visuals";
          }}
          onChange={(next) => window.history.replaceState({}, "", `/visuals/${next}`)}
          onDeleted={(gone) => setLibrary((prev) => prev.filter((v) => v.id !== gone))}
        />
      )}
    </>
  );
}
