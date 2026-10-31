import Wordmark from "./Wordmark";

// The chrome for someone without an account.
//
// Not the utility bar: none of what is in it applies to a reader who cannot
// save, and offering Add to someone with nowhere to put it is worse than
// offering nothing. What does belong is the mark and a way in.
//
// Three surfaces share this now -- a shared library, one shared save, and the
// three written pages when a stranger opens them -- which is the only reason
// they stay the same shape as each other.
// `children` is anything a page needs beside the invitation -- the demo's Add
// is the one so far -- grouped with it so the bar keeps its two ends.
export default function PublicBar({ children }) {
  return (
    <header className="shared-bar">
      <div className="shared-bar-inner">
        <a className="shared-brand wordmark-link" href="/">
          <Wordmark className="shared-mark" />
        </a>
        {/* "Get Kivli" was the first wording and it was worse: a brand name
            means nothing to someone who has never seen it, so the button says
            what pressing it is for. */}
        <div className="shared-bar-actions">
          {children}
          <a className="shared-cta-btn" href="/login">
            Create Your Own
          </a>
        </div>
      </div>
    </header>
  );
}
