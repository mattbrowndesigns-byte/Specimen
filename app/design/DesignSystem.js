"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, RotateCcw } from "lucide-react";
import UtilityBar from "../_ui/UtilityBar";
import SiteFooter from "../_ui/SiteFooter";
import { copyText } from "../_ui/CopyForAI";
import useVariant from "../_ui/useVariant";
import { EMPTY, countOverrides, overridesCss, readOverrides, saveOverrides } from "@/lib/designOverrides";
import { countTokenUses, readRules, readTokens, resolveColours, stateRules } from "./readStyles";
import { TYPE_ROLES } from "./tokens";
import { COMPONENTS } from "./components";
import { Colours, Corners, Icons, Layout, Motion, Overview, Shadows, Spacing, Type } from "./Foundations";
import ComponentSection from "./ComponentSection";

// Kivli's design system, as it is. Everything here is read off the stylesheets
// the app is running and drawn with the app's own classes, so it can't describe
// a design that isn't there. Editing changes one browser and nothing else.

const FOUNDATIONS = [
  ["overview", "Overview"],
  ["colour", "Color"],
  ["type", "Type"],
  ["spacing", "Spacing"],
  ["corners", "Corners"],
  ["shadows", "Shadows"],
  ["motion", "Motion"],
  ["layout", "Layout"],
  ["icons", "Icons"],
];

const selectorsOf = (id) => TYPE_ROLES.find((r) => r.id === id)?.selectors;

export default function DesignSystem() {
  const variant = useVariant();
  const [styles, setStyles] = useState(null);
  const [overrides, setOverrides] = useState(EMPTY);
  const [view, setView] = useState("both");
  const [gaps, setGaps] = useState({});
  const [copied, setCopied] = useState(false);
  const [resets, setResets] = useState(0);

  useEffect(() => {
    const rules = readRules();
    setStyles({ rules, tokens: readTokens(rules), uses: countTokenUses(rules) });
    setOverrides(readOverrides());
    // The states, as classes.
    const node = document.createElement("style");
    node.id = "ds-states";
    node.textContent = stateRules(rules);
    document.head.appendChild(node);
    return () => node.remove();
  }, []);

  // Each theme's tokens with whatever is being tried laid over them.
  const tokens = useMemo(
    () =>
      styles && {
        light: { ...styles.tokens.light, ...overrides.light },
        dark: { ...styles.tokens.dark, ...overrides.dark },
      },
    [styles, overrides]
  );
  const colours = useMemo(
    () => tokens && { light: resolveColours(tokens.light), dark: resolveColours(tokens.dark) },
    [tokens]
  );

  function keep(next) {
    const saved = { ...next, css: overridesCss(next, selectorsOf) };
    setOverrides(saved);
    saveOverrides(saved);
  }

  // One token in one theme. The "-rgb" twin follows it, or a glow keeps the old
  // colour.
  function setToken(theme, name, value) {
    const themed = { ...overrides[theme] };
    const original = styles.tokens[theme][name];
    const twin = `${name}-rgb`;
    if (!value || value === original) {
      delete themed[name];
      delete themed[twin];
    } else {
      themed[name] = value;
      if (styles.tokens[theme][twin] && /^#[0-9a-f]{6}$/i.test(value)) {
        themed[twin] = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)).join(", ");
      }
    }
    keep({ ...overrides, [theme]: themed });
  }

  // A size is the same in both themes.
  function setTypeToken(name, value) {
    const next = { ...overrides };
    for (const theme of ["light", "dark"]) {
      const themed = { ...next[theme] };
      if (value === styles.tokens[theme][name]) delete themed[name];
      else themed[name] = value;
      next[theme] = themed;
    }
    keep(next);
  }

  function setType(role, prop, value) {
    const props = { ...overrides.type[role] };
    if (value) props[prop] = value;
    else delete props[prop];
    const type = { ...overrides.type, [role]: props };
    if (!Object.keys(props).length) delete type[role];
    keep({ ...overrides, type });
  }

  function changesAsText() {
    const out = ["Design changes to apply:"];
    const sizes = Object.entries(overrides.light).filter(([name]) => name.startsWith("--type-"));
    if (sizes.length) out.push("", "Text sizes");
    for (const [name, value] of sizes) out.push(`  ${name}: ${styles.tokens.light[name]} -> ${value}`);
    for (const theme of ["light", "dark"]) {
      const rows = Object.entries(overrides[theme]).filter(([name]) => !name.endsWith("-rgb") && !name.startsWith("--type-"));
      if (rows.length) out.push("", theme === "light" ? "Light" : "Dark");
      for (const [name, value] of rows) out.push(`  ${name}: ${styles.tokens[theme][name]} -> ${value}`);
    }
    const roles = Object.entries(overrides.type);
    if (roles.length) out.push("", "Type");
    for (const [id, props] of roles) {
      const role = TYPE_ROLES.find((r) => r.id === id);
      for (const [prop, value] of Object.entries(props)) out.push(`  ${role.name} (${role.selectors}): ${prop} -> ${value}`);
    }
    return out.join("\n");
  }

  async function copy() {
    try {
      await copyText(changesAsText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const changed = countOverrides(overrides);
  const themes = view === "both" ? ["light", "dark"] : [view];
  const shared = styles && { ...styles, live: tokens, colours, overrides, themes, setToken, setType, setTypeToken, resets };

  return (
    <>
      <UtilityBar />
      <main className="page ds-page">
        <header className="ds-head">
          <div>
            <h1>Design System</h1>
            <p>
              The app as it is today, read off its own styles. Change a color or a text size and the whole app wears it, in
              this browser only.
            </p>
          </div>
          <div className="view-switch">
            {["light", "dark", "both"].map((id) => (
              <button key={id} className={view === id ? "active" : ""} aria-pressed={view === id} onClick={() => setView(id)}>
                {id === "light" ? "Light" : id === "dark" ? "Dark" : "Both"}
              </button>
            ))}
          </div>
        </header>

        {variant !== "refined" && styles && (
          <p className="error">
            This browser is showing one of the older designs, so the parts below are drawn in it. <a href="/demo">Open /demo</a>{" "}
            to go back to the current one.
          </p>
        )}

        <div className="ds-layout">
          <nav className="ds-nav" aria-label="Design system">
            <h2>Foundations</h2>
            {FOUNDATIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
            <h2>Components</h2>
            {COMPONENTS.map((c) => (
              <a key={c.id} href={`#${c.id}`}>
                {c.name}
                {gaps[c.id] > 0 && <span className="ds-gap-count">{gaps[c.id]}</span>}
              </a>
            ))}
          </nav>

          <div className="ds-body">
            {!styles && <p className="empty-small">Reading the styles…</p>}
            {styles && (
              <>
                <Overview {...shared} gaps={gaps} />
                <Colours {...shared} />
                <Type {...shared} />
                <Spacing {...shared} />
                <Corners {...shared} />
                <Shadows {...shared} />
                <Motion {...shared} />
                <Layout {...shared} />
                <Icons />
                {COMPONENTS.map((component) => (
                  <ComponentSection
                    key={component.id}
                    component={component}
                    themes={themes}
                    live={tokens}
                    onGaps={(n) => setGaps((prev) => (prev[component.id] === n ? prev : { ...prev, [component.id]: n }))}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        {changed > 0 && (
          <div className="ds-changes" role="status">
            <span>
              Trying {changed} {changed === 1 ? "change" : "changes"}, only in this browser
            </span>
            <div className="tag-actions">
              <a className="ds-changes-link" href="/">
                See It in the App
              </a>
              <button className="primary" onClick={copy}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy Changes"}
              </button>
              <button
                onClick={() => {
                  keep(EMPTY);
                  setResets((n) => n + 1);
                }}
              >
                <RotateCcw size={14} /> Reset
              </button>
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
