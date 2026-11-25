"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { safeValue } from "@/lib/designOverrides";
import { contrast, countValues, distance, over, rawColours, toHex } from "./readStyles";
import { PAIRS, PROPOSED_RADIUS, PROPOSED_SPACE, PROPOSED_TYPE, TOKEN_GROUPS, TYPE_ROLES } from "./tokens";
import { ICONS } from "./icons.generated";
import { Gap, Panes, Section, ValueBars } from "./ui";

const px = (value) => (/^-?[\d.]+px$/.test(value) ? parseFloat(value) : null);

const radii = (rules) => countValues(rules, ["border-top-left-radius"]);
const shadows = (rules) => countValues(rules, ["box-shadow"]);
const sizes = (rules) => countValues(rules, ["font-size"]);

// ---- overview ---------------------------------------------------------------

export function Overview({ rules, tokens, colours, gaps }) {
  const facts = useMemo(() => {
    const near = nearlyTheSame(colours.light).length + nearlyTheSame(colours.dark).length;
    return [
      { n: Object.keys(colours.light).length, label: "named colors" },
      { n: near, label: "pairs you couldn’t tell apart", bad: near > 0 },
      { n: rawColours(rules).length, label: "colors typed by hand", bad: true },
      { n: sizes(rules).length, label: "text sizes", bad: true },
      { n: radii(rules).length, label: "corner sizes", bad: true },
      { n: shadows(rules).length, label: "shadows", bad: true },
    ];
  }, [rules, colours]);
  const missing = Object.values(gaps).reduce((a, n) => a + n, 0);
  return (
    <Section id="overview" title="Overview" note="Counted as you opened the page. Both stylesheets are in here, so a value the current design has since replaced still counts.">
      <div className="ds-facts">
        {facts.map((f) => (
          <div key={f.label} className={f.bad ? "ds-fact ds-fact-bad" : "ds-fact"}>
            <strong>{f.n}</strong>
            <span>{f.label}</span>
          </div>
        ))}
        <div className={missing ? "ds-fact ds-fact-bad" : "ds-fact"}>
          <strong>{missing}</strong>
          <span>states with no style of their own</span>
        </div>
      </div>
      <p className="ds-note">
        {Object.keys(tokens.light).length} values have a name today. Color mostly does. Type, spacing and corners mostly
        don&rsquo;t, so those are where a change means finding every place by hand.
      </p>
    </Section>
  );
}

// ---- colour -----------------------------------------------------------------

// Within a family. A white card and white words on a black button are the same
// colour and not the same thing; two greys that both fill a control are.
const FAMILIES = [["Surfaces", "Fills"], ["Borders"], ["Text"], ["Brand"], ["Inverted"], ["Status"]].map((names) =>
  TOKEN_GROUPS.filter((g) => names.includes(g.name)).flatMap((g) => Object.keys(g.tokens))
);

function nearlyTheSame(colours) {
  const out = [];
  for (const family of FAMILIES) {
    const names = family.filter((n) => colours[n]?.a === 1);
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) {
        const d = distance(colours[names[i]], colours[names[j]]);
        if (d < 1.2) out.push({ a: names[i], b: names[j], same: d === 0 });
      }
  }
  return out;
}

function Swatch({ name, purpose, uses, live, colours, overrides, tokens, setToken }) {
  const [open, setOpen] = useState(false);
  const changed = name in overrides.light || name in overrides.dark;
  return (
    <div className={`ds-swatch${changed ? " ds-swatch-changed" : ""}`}>
      <button className="ds-swatch-face" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`Edit ${name}`}>
        <span className="ds-chequer">
          <span style={{ background: live.light[name] && cssOf(colours.light[name]) }} />
        </span>
        <span className="ds-chequer">
          <span style={{ background: live.dark[name] && cssOf(colours.dark[name]) }} />
        </span>
      </button>
      <div className="ds-swatch-text">
        <code>{name}</code>
        <span>{purpose || <Gap>Not described</Gap>}</span>
        <small>
          {uses ? `${uses} ${uses === 1 ? "use" : "uses"}` : <Gap>Not used in the styles</Gap>}
        </small>
      </div>
      {open && (
        <div className="ds-swatch-edit">
          {["light", "dark"].map((theme) => (
            <TokenField
              key={theme}
              label={theme === "light" ? "Light" : "Dark"}
              value={live[theme][name] || ""}
              colour={colours[theme][name]}
              changed={name in overrides[theme]}
              onChange={(value) => setToken(theme, name, value)}
              onReset={() => setToken(theme, name, tokens[theme][name])}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const cssOf = (c) => (c ? `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})` : "transparent");

function TokenField({ label, value, colour, changed, onChange, onReset }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const ok = safeValue(text) && (CSS.supports("color", text) || /var\(/.test(text));
  return (
    <div className="ds-token-field">
      <span>{label}</span>
      {colour?.a === 1 && (
        <input type="color" value={toHex(colour)} onChange={(e) => onChange(e.target.value)} aria-label={`${label} color`} />
      )}
      <input
        className="ds-text"
        value={text}
        spellCheck={false}
        aria-label={`${label} value`}
        aria-invalid={!ok}
        onChange={(e) => {
          setText(e.target.value);
          if (safeValue(e.target.value) && CSS.supports("color", e.target.value)) onChange(e.target.value);
        }}
      />
      {changed && (
        <button className="link-btn" onClick={onReset}>
          Undo
        </button>
      )}
    </div>
  );
}

export function Colours(props) {
  const { rules, live, colours, uses, themes } = props;
  const described = new Set(TOKEN_GROUPS.flatMap((g) => Object.keys(g.tokens)));
  const rest = Object.keys(colours.light).filter((n) => !described.has(n) && !n.endsWith("-rgb"));
  const raw = useMemo(() => rawColours(rules), [rules]);
  const near = useMemo(() => ({ light: nearlyTheSame(colours.light), dark: nearlyTheSame(colours.dark) }), [colours]);

  return (
    <Section id="colour" title="Color" note="Left half is light, right half is dark. Press a swatch to change it.">
      {TOKEN_GROUPS.map((group) => (
        <div className="ds-group" key={group.name}>
          <h3>{group.name}</h3>
          <p className="ds-note">{group.note}</p>
          <div className="ds-swatches">
            {Object.entries(group.tokens)
              .filter(([name]) => name in colours.light || name in colours.dark)
              .map(([name, purpose]) => (
                <Swatch key={name} name={name} purpose={purpose} {...props} uses={uses[name]} />
              ))}
          </div>
        </div>
      ))}
      {rest.length > 0 && (
        <div className="ds-group">
          <h3>Not described yet</h3>
          <div className="ds-swatches">
            {rest.map((name) => (
              <Swatch key={name} name={name} {...props} uses={uses[name]} />
            ))}
          </div>
        </div>
      )}

      <div className="ds-group">
        <h3>Tints</h3>
        <p className="ds-note">
          <Gap>Proposed</Gap> Shades worked out from each color. The app has none of these by name yet.
        </p>
        <Panes themes={themes} live={live}>
          {() =>
            ["--accent", "--ramp-mid", "--brand-ink", "--danger"].map((name) => (
              <div className="ds-tints" key={name}>
                <code>{name}</code>
                <div>
                  {[10, 20, 35, 55, 80, 100].map((n) => (
                    <span key={n} data-tip={`${n}% over the page`} style={{ background: `color-mix(in srgb, var(${name}) ${n}%, var(--bg))` }} />
                  ))}
                  {[15, 30].map((n) => (
                    <span key={n} data-tip={`${n}% darker`} style={{ background: `color-mix(in srgb, var(${name}), black ${n}%)` }} />
                  ))}
                </div>
              </div>
            ))
          }
        </Panes>
      </div>

      <div className="ds-group">
        <h3>Contrast</h3>
        <p className="ds-note">Words need 4.5. A mark or a control’s edge needs 3.</p>
        <Panes themes={themes} live={live}>
          {(theme) => (
            <table className="ds-table">
              <tbody>
                {PAIRS.filter(([a, b]) => colours[theme][a] && colours[theme][b]).map(([a, b, kind]) => {
                  const under = over(colours[theme][b], colours[theme]["--bg"]);
                  const ratio = contrast(over(colours[theme][a], under), under);
                  const need = kind ? 3 : 4.5;
                  return (
                    <tr key={a + b}>
                      <td>
                        <span className="ds-pair" style={{ background: `var(${b})`, color: `var(${a})`, borderColor: kind === "edge" ? `var(${a})` : undefined }}>
                          Aa
                        </span>
                      </td>
                      <td>
                        <code>{a}</code> on <code>{b}</code>
                      </td>
                      <td className="ds-num">{ratio.toFixed(2)}</td>
                      <td>{ratio >= need ? <span className="ds-pass">Passes</span> : <Gap>Needs {need}</Gap>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panes>
      </div>

      <div className="ds-group">
        <h3>Colors you couldn’t tell apart</h3>
        <p className="ds-note">Two names for one color in the same family. Either merge them, or pull them apart.</p>
        <Panes themes={themes} live={live}>
          {(theme) =>
            near[theme].length ? (
              <ul className="ds-list">
                {near[theme].map(({ a, b, same }) => (
                  <li key={a + b}>
                    <span className="ds-twin">
                      <span style={{ background: `var(${a})` }} />
                      <span style={{ background: `var(${b})` }} />
                    </span>
                    <code>{a}</code> and <code>{b}</code> {same && <em>the same color</em>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ds-note">None.</p>
            )
          }
        </Panes>
      </div>

      <div className="ds-group">
        <h3>Typed by hand</h3>
        <p className="ds-note">Colors written where a name should be. Changing a token doesn’t reach these.</p>
        <div className="ds-raw">
          {raw.map((r) => (
            <span key={r.value} data-tip={r.where.slice(0, 4).join(", ")}>
              <i style={{ background: r.value }} />
              <code>{r.value}</code>
              {r.where.length > 1 && ` ×${r.where.length}`}
            </span>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ---- type --------------------------------------------------------------------

const TYPE_PROPS = [
  ["font-size", "Size"],
  ["font-weight", "Weight"],
  ["line-height", "Line"],
  ["letter-spacing", "Spacing"],
];

function TypeRow({ role, overrides, setType }) {
  const ref = useRef(null);
  const [now, setNow] = useState(null);
  const [open, setOpen] = useState(false);
  const mine = overrides.type[role.id] || {};
  const tried = JSON.stringify(mine);

  useEffect(() => {
    const el = ref.current?.querySelector("[data-measure]");
    if (!el) return;
    const s = getComputedStyle(el);
    const size = parseFloat(s.fontSize);
    const line = parseFloat(s.lineHeight);
    const track = parseFloat(s.letterSpacing);
    setNow({
      "font-size": `${+size.toFixed(2)}px`,
      "font-weight": s.fontWeight,
      "line-height": Number.isNaN(line) ? "normal" : (line / size).toFixed(2),
      "letter-spacing": Number.isNaN(track) ? "0" : `${(track / size).toFixed(3)}em`,
      family: /figtree/i.test(s.fontFamily) ? "Figtree" : "System",
    });
  }, [tried]);

  return (
    <div className={`ds-type-row${tried !== "{}" ? " ds-swatch-changed" : ""}`}>
      <div className="ds-type-meta">
        <strong>{role.name}</strong>
        <span>{role.as}</span>
        {now && (
          <small>
            {now.family} {now["font-size"]} / {now["line-height"]} · {now["font-weight"]} · {now["letter-spacing"]}
          </small>
        )}
        <button className="link-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Done" : "Change"}
        </button>
      </div>
      <div className="ds-type-sample" ref={ref}>
        {role.sample({ "data-measure": "", tabIndex: -1 })}
      </div>
      {open && now && (
        <div className="ds-type-edit">
          {TYPE_PROPS.map(([prop, label]) => (
            <label key={prop}>
              <span>{label}</span>
              <input
                className="ds-text"
                defaultValue={mine[prop] || ""}
                placeholder={now[prop]}
                spellCheck={false}
                onChange={(e) => {
                  const value = e.target.value.trim();
                  if (!value) setType(role.id, prop, null);
                  else if (safeValue(value) && CSS.supports(prop, value)) setType(role.id, prop, value);
                }}
              />
            </label>
          ))}
          <p className="ds-note">
            Reaches <code>{role.selectors}</code>
          </p>
        </div>
      )}
    </div>
  );
}

export function Type(props) {
  const { rules } = props;
  const used = useMemo(() => sizes(rules), [rules]);
  const scale = new Set(PROPOSED_TYPE.map((t) => t.size).filter((n) => typeof n === "number"));
  const covered = new Set(TYPE_ROLES.map((r) => r.as));
  return (
    <Section id="type" title="Type" note="Text by the job it does, measured off the real thing. A heading’s level (H1 to H6) says where it sits in the page, not how big it is.">
      <div className="ds-type">
        {TYPE_ROLES.map((role) => (
          <TypeRow key={role.id} role={role} {...props} />
        ))}
      </div>

      <div className="ds-group">
        <h3>A whole scale</h3>
        <p className="ds-note">
          <Gap>Proposed</Gap> Eleven steps in place of the {used.length} sizes written today, with a place kept for what isn’t
          used yet.
        </p>
        <table className="ds-table ds-scale">
          <tbody>
            {PROPOSED_TYPE.map((t) => (
              <tr key={t.name}>
                <td style={{ fontSize: typeof t.size === "number" ? Math.min(t.size, 44) : 44, fontWeight: t.weight, fontFamily: t.family === "Figtree" ? "var(--display)" : t.family === "Mono" ? "ui-monospace, monospace" : undefined, lineHeight: 1.15 }}>
                  {t.name}
                </td>
                <td className="ds-num">{t.size}</td>
                <td className="ds-num">{t.weight}</td>
                <td>{t.job}</td>
                <td>{covered.has(t.name) ? <span className="ds-pass">In the app</span> : <Gap>Not in the app</Gap>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ds-group">
        <h3>Sizes written today</h3>
        <ValueBars rows={used} limit={30} fits={(v) => scale.has(px(v)) || /clamp|calc|var/.test(v)} />
      </div>
    </Section>
  );
}

// ---- the rest -----------------------------------------------------------------

export function Spacing({ rules }) {
  const rows = useMemo(() => {
    const counts = new Map();
    const props = ["row-gap", "padding-top", "padding-right", "padding-bottom", "padding-left", "margin-top", "margin-bottom"];
    for (const row of countValues(rules, props)) {
      const n = px(row.value);
      if (n === null || n <= 0) continue;
      const was = counts.get(n);
      counts.set(n, was ? { ...was, count: was.count + row.count } : { ...row, value: `${n}px` });
    }
    return [...counts.values()].sort((a, b) => px(a.value) - px(b.value));
  }, [rules]);
  const scale = new Set(PROPOSED_SPACE);
  const off = rows.filter((r) => !scale.has(px(r.value)));
  return (
    <Section id="spacing" title="Spacing" note="The space inside and between things.">
      <p className="ds-note">
        <Gap>Proposed</Gap> {PROPOSED_SPACE.join(", ")}. {off.length} of {rows.length} spaces written today are off it.
      </p>
      <div className="ds-steps">
        {PROPOSED_SPACE.map((n) => (
          <span key={n}>
            <i style={{ width: n, height: n }} />
            {n}
          </span>
        ))}
      </div>
      <ValueBars rows={rows} limit={48} fits={(v) => scale.has(px(v))} />
    </Section>
  );
}

export function Corners({ rules, themes, live }) {
  const rows = useMemo(() => radii(rules), [rules]);
  const scale = new Set(PROPOSED_RADIUS);
  return (
    <Section id="corners" title="Corners" note="Three have names: card, field and panel. The rest are typed.">
      <Panes themes={themes} live={live}>
        {() => (
          <div className="ds-corners">
            {rows.slice(0, 18).map((r) => (
              <span key={r.value}>
                <i style={{ borderRadius: r.value }} />
                <code>{r.value}</code>
                {r.count}
              </span>
            ))}
          </div>
        )}
      </Panes>
      <p className="ds-note">
        <Gap>Proposed</Gap> {PROPOSED_RADIUS.map((n) => (n === 999 ? "full" : n)).join(", ")}.{" "}
        {rows.filter((r) => px(r.value) !== null && !scale.has(px(r.value))).length} sizes are off it.
      </p>
    </Section>
  );
}

export function Shadows({ rules, themes, live }) {
  const rows = useMemo(() => shadows(rules).filter((r) => !/^inset|vmax/.test(r.value)), [rules]);
  return (
    <Section id="shadows" title="Shadows" note="Rings and lifts. A lift drawn for light mostly disappears in dark, which is why dark needs its own.">
      <Panes themes={themes} live={live}>
        {() => (
          <div className="ds-shadows">
            {rows.map((r) => (
              <span key={r.value} data-tip={r.where.join(", ")}>
                <i style={{ boxShadow: r.value }} />
                <code>{r.value.length > 46 ? `${r.value.slice(0, 44)}…` : r.value}</code>
              </span>
            ))}
          </div>
        )}
      </Panes>
    </Section>
  );
}

export function Motion({ rules, tokens }) {
  const [played, setPlayed] = useState(0);
  const rows = useMemo(() => {
    const counts = new Map();
    for (const { value, count, where } of countValues(rules, ["transition-duration", "animation-duration"])) {
      for (const part of value.split(",")) {
        const v = part.trim();
        if (v === "0s" || !/s$/.test(v)) continue;
        const was = counts.get(v);
        counts.set(v, { value: v, count: (was?.count || 0) + count, where: was?.where || where });
      }
    }
    return [...counts.values()].sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
  }, [rules]);
  return (
    <Section id="motion" title="Motion" note={`One curve has a name, --ease: ${tokens.light["--ease"] || "none"}. Nothing moves for anyone who asks for less motion.`}>
      <button className="filters-btn" onClick={() => setPlayed(played + 1)}>
        Play
      </button>
      <div className="ds-motion">
        {rows.map((r) => (
          <div key={r.value}>
            <code>{r.value}</code>
            <span className="ds-motion-track">
              <i className={played % 2 ? "ds-there" : ""} style={{ transitionDuration: r.value }} />
            </span>
            <span className="ds-bar-count">{r.count}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function Layout({ rules, live }) {
  const [widths, layers] = useMemo(() => {
    const seen = new Map();
    for (const { media } of rules)
      for (const m of media)
        for (const [, n] of m.matchAll(/(?:max|min)-width:\s*(\d+)px/g)) seen.set(+n, (seen.get(+n) || 0) + 1);
    return [
      [...seen].sort((a, b) => a[0] - b[0]),
      countValues(rules, ["z-index"]).sort((a, b) => parseInt(a.value, 10) - parseInt(b.value, 10)),
    ];
  }, [rules]);
  const names = ["--grid-columns", "--grid-gutter", "--grid-margin", "--bar-h", "--control-h", "--prose-max", "--card-min-large", "--card-min-medium", "--card-min-small", "--row-thumb-w", "--favicon-size", "--ramp-h", "--r-card", "--r-field", "--r-panel"];
  return (
    <Section id="layout" title="Layout" note="The grid, the sizes that have names, where the page changes shape, and what’s on top of what.">
      <div className="ds-columns" aria-hidden="true">
        {Array.from({ length: Number(live.light["--grid-columns"]) || 12 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div className="ds-two">
        <table className="ds-table">
          <tbody>
            {names.filter((n) => live.light[n]).map((n) => (
              <tr key={n}>
                <td>
                  <code>{n}</code>
                </td>
                <td className="ds-num">{live.light[n]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div>
          <h3>Breakpoints</h3>
          <p className="ds-note">{widths.map(([n, c]) => `${n}px (${c})`).join(", ")}</p>
          <h3>Layers</h3>
          <p className="ds-note">{layers.map((l) => `${l.value} (${l.count})`).join(", ")}</p>
        </div>
      </div>
    </Section>
  );
}

export function Icons() {
  return (
    <Section id="icons" title="Icons" note={`Lucide, ${ICONS.length} of them. 14 in small buttons, 15 or 16 in rows, 18 to close a dialog.`}>
      <div className="ds-icons">
        {ICONS.map(({ name, Icon }) => (
          <span key={name}>
            <Icon size={18} />
            <small>{name}</small>
          </span>
        ))}
      </div>
    </Section>
  );
}
