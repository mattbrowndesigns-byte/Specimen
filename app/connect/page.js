"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import UtilityBar from "../_ui/UtilityBar";
import SiteFooter from "../_ui/SiteFooter";
import { copyText } from "../_ui/CopyForAI";
import { useIsDemo } from "../_ui/demoState";
import { retireAll } from "../_ui/connectPrompts";

// How to point an AI app at your library, and which ones you already have.
//
// The one thing everyone needs is the address, so it comes first and copies
// in one press. The steps differ by app, so they sit behind a switch rather
// than in four stacked lists you have to scan for your own. The examples are
// there because "it can search your library" is abstract until you see the
// kind of question it turns into.
//
// In the demo the address is the demo server, which needs no sign-in -- the
// one thing a stranger can actually do with this page is try it. A step that
// differs there is written as a pair, [signed in, demo], with null to drop it.

const APPS = [
  {
    id: "claude",
    label: "Claude",
    steps: [
      "In Claude, open Settings, then Connectors.",
      "Choose Add custom connector. Name it Kivli and paste the address above.",
      ["Press Connect. Kivli opens and asks you to allow access.", "Press Add. The demo needs no sign-in."],
      "In a chat, turn Kivli on from the tools menu and ask away.",
    ],
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    steps: [
      "In ChatGPT, open Settings, then Apps & Connectors.",
      "Under Advanced settings, turn on Developer mode, then choose Create.",
      ["Name it Kivli, paste the address above and pick OAuth for authentication.", "Name it Kivli, paste the address above and pick No authentication."],
      ["Kivli opens and asks you to allow access. Then add it to a chat from the tools menu.", "Then add it to a chat from the tools menu."],
    ],
  },
  {
    id: "code",
    label: "Claude Code",
    command: true,
    steps: [
      "Run the command below in a terminal.",
      ["Start Claude Code, type /mcp and choose Kivli to sign in.", "Start Claude Code and ask away."],
    ],
  },
  {
    id: "other",
    label: "Other apps",
    steps: [
      "Any app that supports remote MCP servers works: Cursor, VS Code, Windsurf and others.",
      "Add a server, paste the address above and choose HTTP if it asks for a transport.",
      ["When it opens Kivli, allow access.", null],
    ],
  },
];

const EXAMPLES = [
  "Search my Kivli library for pricing pages and compare how they lay out the plans.",
  "Open my research collection and tell me what those sites have in common.",
  "Find saves like Ramp and say what each one borrows from it.",
  "Look at the footer of stripe.com in my library. What's in it?",
];

function CopyField({ value, label }) {
  const [state, setState] = useState("idle");
  async function copy() {
    try {
      await copyText(value);
      setState("copied");
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 2000);
  }
  return (
    <div className="connect-field">
      <code aria-label={label}>{value}</code>
      <button type="button" className="connect-copy" onClick={copy}>
        {state === "copied" ? <Check size={15} /> : <Copy size={15} />}
        {state === "copied" ? "Copied" : state === "error" ? "Couldn’t copy" : "Copy"}
      </button>
    </div>
  );
}

export default function ConnectPage() {
  const demo = useIsDemo();
  const [origin, setOrigin] = useState("");
  const [app, setApp] = useState("claude");
  const [grants, setGrants] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState(null);

  // The address is this site's own, read after mount so a preview deploy
  // describes itself rather than production.
  useEffect(() => setOrigin(window.location.origin), []);

  const loadGrants = useCallback(async () => {
    const res = await fetch("/api/account/connections");
    if (!res.ok) return;
    const data = await res.json();
    setGrants(data.grants || []);
    // Connected somewhere: nothing left to nudge about.
    if (data.grants?.length) retireAll();
    setUnavailable(Boolean(data.unavailable));
  }, []);

  useEffect(() => {
    loadGrants();
  }, [loadGrants]);

  async function disconnect(grant) {
    setError(null);
    const res = await fetch(`/api/account/connections?client=${encodeURIComponent(grant.clientId)}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Couldn’t disconnect that app");
      return;
    }
    loadGrants();
  }

  const address = origin ? `${origin}/api/mcp${demo ? "/demo" : ""}` : "";
  const chosen = APPS.find((a) => a.id === app);

  return (
    <>
      <UtilityBar onError={setError} />

      <main className="page page-wide">
        <div className="top-nav">
          <h1>Connect an AI</h1>
        </div>

        <p className="tag-page-note">
          Give Claude, ChatGPT or any AI app that supports MCP a way into your library. It can search
          your saves, open one with its screenshots, colours and type, read a collection, and find
          things like the one you&rsquo;re looking at.{" "}
          {demo
            ? "Here it can only read."
            : "Ask it to and it can save websites and resources too, and file them in collections. It can't edit or delete anything you've already saved."}
        </p>

        {error && <p className="error">{error}</p>}

        <section className="connect-panel">
          <h2>Server address</h2>
          {address && <CopyField value={address} label="MCP server address" />}
          <p className="connect-note">
            {demo
              ? "This is the demo library, so there's no sign-in. Paste it into your own AI and ask it about the saves you see here."
              : "The first time you use it, Kivli asks you to sign in and allow access."}
          </p>
        </section>

        <section className="connect-panel">
          <h2>Add it to your app</h2>
          <div className="view-switch connect-switch" role="group" aria-label="Which app">
            {APPS.map((a) => (
              <button key={a.id} type="button" className={app === a.id ? "active" : ""} onClick={() => setApp(a.id)}>
                {a.label}
              </button>
            ))}
          </div>
          <ol className="connect-steps">
            {chosen.steps
              .map((step) => (Array.isArray(step) ? step[demo ? 1 : 0] : step))
              .filter(Boolean)
              .map((step) => (
                <li key={step}>{step}</li>
              ))}
          </ol>
          {chosen.command && address && (
            <CopyField value={`claude mcp add --transport http kivli ${address}`} label="Terminal command" />
          )}
        </section>

        <section className="connect-panel">
          <h2>Things to ask</h2>
          <ul className="connect-examples">
            {EXAMPLES.map((example) => (
              <li key={example}>&ldquo;{example}&rdquo;</li>
            ))}
          </ul>
        </section>

        {!demo && (
          <section className="connect-panel">
            <h2>Connected apps</h2>
            {grants === null ? (
              <p className="connect-note">Checking…</p>
            ) : unavailable ? (
              <p className="connect-note">Connecting apps isn&rsquo;t switched on for this Kivli yet.</p>
            ) : grants.length === 0 ? (
              <p className="connect-note">Nothing connected yet.</p>
            ) : (
              <ul className="connect-grants">
                {grants.map((grant) => (
                  <li key={grant.clientId}>
                    <span className="connect-grant-name">{grant.name}</span>
                    {grant.grantedAt && (
                      <span className="connect-grant-date">
                        Allowed{" "}
                        {new Date(grant.grantedAt).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    )}
                    <button type="button" className="connect-revoke" onClick={() => disconnect(grant)}>
                      Disconnect
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
