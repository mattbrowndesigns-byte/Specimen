// The page's own furniture.

export function Section({ id, title, note, children }) {
  return (
    <section className="ds-section" id={id}>
      <header>
        <h2>{title}</h2>
        {note && <p>{note}</p>}
      </header>
      {children}
    </section>
  );
}

// A piece of the app in one theme, whichever the page is in. The tokens are put
// on the pane itself, so everything inside reads them rather than the page's.
export function Pane({ theme, tokens, label = true, className = "", children }) {
  return (
    <div className={`ds-pane ${className}`} style={{ ...tokens, colorScheme: theme }}>
      {label && <span className="ds-pane-label">{theme === "light" ? "Light" : "Dark"}</span>}
      {children}
    </div>
  );
}

export const Panes = ({ themes, live, children, className }) => (
  <div className={`ds-panes ds-panes-${themes.length}`}>
    {themes.map((theme) => (
      <Pane key={theme} theme={theme} tokens={live[theme]} className={className}>
        {children(theme)}
      </Pane>
    ))}
  </div>
);

export const Gap = ({ children }) => <span className="ds-gap">{children}</span>;

// How often each value is written, longest first, with what's off a scale said
// so. `fits` is the proposed scale.
export function ValueBars({ rows, fits, limit = 24, draw }) {
  const most = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="ds-bars">
      {rows.slice(0, limit).map((row) => (
        <div className="ds-bar-row" key={row.value} data-tip={row.where.join(", ")}>
          {draw?.(row)}
          <code>{row.value}</code>
          <span className="ds-bar-track">
            <span style={{ width: `${(row.count / most) * 100}%` }} />
          </span>
          <span className="ds-bar-count">{row.count}</span>
          {fits && <span className="ds-bar-fit">{fits(row.value) ? "" : <Gap>Off the scale</Gap>}</span>}
        </div>
      ))}
      {rows.length > limit && <p className="ds-note">And {rows.length - limit} more, used once or twice.</p>}
    </div>
  );
}
