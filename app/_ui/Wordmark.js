// The wordmark, as markup rather than as a string.
//
// One span per letter so the warm sweep can run through them in order, and
// each `i` drawn twice and clipped -- stem below the cut, dot above it -- so
// its dot can hop while the stem stays put. The duplicate carries aria-hidden,
// so the accessible name is still "Kivli" and not "Kiivlii". Only the i
// wrappers are inline-block; the plain letters stay inline, which leaves the
// kerning untouched.
//
// This was inline in UtilityBar and the shared page had a plain `<h1>Kivli</h1>`
// beside it -- same font, no letters to animate, so the one page a stranger
// sees was the one page where the mark sat dead. A component is the only way
// those two don't drift again.
const LETTERS = ["K", "i", "v", "l", "i"];

export default function Wordmark({ className = "", as: Tag = "h1" }) {
  return (
    <Tag className={`wordmark${className ? ` ${className}` : ""}`}>
      {LETTERS.map((letter, step) =>
        letter === "i" ? (
          <span className="wordmark-letter wordmark-i" style={{ "--step": step }} key={step}>
            <span className="wordmark-i-stem">i</span>
            <span className="wordmark-i-dot" aria-hidden="true">
              i
            </span>
          </span>
        ) : (
          <span className="wordmark-letter" style={{ "--step": step }} key={step}>
            {letter}
          </span>
        )
      )}
    </Tag>
  );
}
