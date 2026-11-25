"use client";
import { useEffect, useRef, useState } from "react";
import { Gap, Pane, Section } from "./ui";

const STATE_NAMES = { rest: "Rest", hover: "Hover", focus: "Focus", active: "Pressed", disabled: "Disabled", error: "Wrong" };
const STATE_CLASS = { hover: "ds-hover", focus: "ds-focus", active: "ds-active ds-hover" };

const part = (state) => (base) => ({
  className: [base, STATE_CLASS[state]].filter(Boolean).join(" ") || undefined,
  disabled: state === "disabled" || undefined,
  tabIndex: -1,
  "data-part": "",
});

// What a state can change about a part, and about what's inside it.
const WATCH = [
  "color", "backgroundColor", "backgroundImage", "borderTopColor", "borderTopWidth", "boxShadow", "opacity", "transform",
  "filter", "textDecorationLine", "outlineStyle", "animationName",
];
const look = (el) =>
  [el, ...[...el.querySelectorAll("*")].slice(0, 8)]
    .map((n) => {
      const s = getComputedStyle(n);
      return WATCH.map((p) => s[p]).join("|");
    })
    .join("#");

export default function ComponentSection({ component, themes, live, onGaps }) {
  const ref = useRef(null);
  const [same, setSame] = useState({});

  // Each state against rest, in the first theme shown. Read once nothing is
  // still moving: a transition part of the way there looks like a difference.
  const theme = themes[0];
  useEffect(() => {
    const timer = setTimeout(() => {
      const found = {};
      for (const cell of ref.current?.querySelectorAll(`[data-theme-pane="${theme}"] [data-cell]`) || []) {
        const [item, state] = cell.dataset.cell.split(":");
        if (state === "rest" || state === "error") continue;
        const rest = ref.current.querySelector(`[data-theme-pane="${theme}"] [data-cell="${item}:rest"] [data-part]`);
        const el = cell.querySelector("[data-part]");
        if (rest && el && look(rest) === look(el)) found[`${item}:${state}`] = true;
      }
      setSame(found);
      onGaps(Object.keys(found).length);
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, live]);

  return (
    <Section id={component.id} title={component.name} note={component.note}>
      <div ref={ref}>
        {component.items.map((item, i) => (
          <div className="ds-item" key={item.name}>
            <div className="ds-item-name">
              <strong>{item.name}</strong>
              {item.note && <span>{item.note}</span>}
            </div>
            <div className={`ds-panes ds-panes-${themes.length}`}>
              {themes.map((t) => (
                <div key={t} data-theme-pane={t}>
                  <Pane theme={t} tokens={live[t]} label={false}>
                    <div className={`ds-states${item.wide ? " ds-states-wide" : ""}`}>
                      {item.states.map((state) => (
                        <div className="ds-state" key={state} data-cell={`${i}:${state}`}>
                          <div className="ds-state-part">{item.render(part(state))}</div>
                          {item.states.length > 1 && (
                            <span className="ds-state-name">
                              {STATE_NAMES[state]}
                              {same[`${i}:${state}`] && <Gap>{state === "focus" ? "Browser’s own" : "Same as rest"}</Gap>}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </Pane>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
