"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, FolderPlus, GitCompare, Layers, PanelTop, Plus, Search } from "lucide-react";
import UtilityBar from "../_ui/UtilityBar";
import SiteFooter from "../_ui/SiteFooter";
import { copyText } from "../_ui/CopyForAI";
import { useIsDemo } from "../_ui/demoState";
import { retireAll } from "../_ui/connectPrompts";

// How to point an AI app at your library, and which ones you already have.
//
// Written for someone arriving cold, which most people here are: a short
// answer to "what is MCP", then what it lets your AI do -- each card carrying
// a sentence you could actually type, because "it can search your library" is
// abstract until you see the question it turns into -- then setup as three
// numbered steps. The address is step one and copies in one press; the
// per-app instructions sit behind a switch in step two rather than in four
// stacked lists you'd have to scan for your own.
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

// What a connected AI can do, one card each, with a request you could type.
// The last two write, and the demo server has no writing tools at all, so
// they're left off there rather than promised.
const ABILITIES = [
  {
    Icon: Search,
    title: "Search your library",
    body: "By words and tags, across your websites, components, resources and images.",
    example: "Find the pricing pages in my Kivli library and compare how they lay out the plans.",
  },
  {
    Icon: PanelTop,
    title: "Look at a save closely",
    body: "The screenshots themselves, the measured palette, the typefaces and the pages it found.",
    example: "Look at the footer of stripe.com in my library. What's in it?",
  },
  {
    Icon: Layers,
    title: "Read a collection",
    body: "Everything you grouped for a project, read together, so it can say what they share.",
    example: "Open my research collection and tell me what those sites have in common.",
  },
  {
    Icon: GitCompare,
    title: "Find things like it",
    body: "Saves that share tags, blocks or a look with the one you name.",
    example: "Find saves like Ramp and say what each one borrows from it.",
  },
  {
    Icon: Plus,
    title: "Save what it finds",
    body: "Websites and resources from your conversation, captured and tagged like any save.",
    example: "Save these three sites to Kivli.",
    writes: true,
  },
  {
    Icon: FolderPlus,
    title: "File it in a collection",
    body: "Make a collection and put saves in it, without leaving the chat.",
    example: "Put those in a new collection called Onboarding.",
    writes: true,
  },
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

// One row per app. Supabase keeps a record for every approval, and adding the
// connector again is a new one, so a single app arrived as three rows called
// "Claude" with nothing to choose between them. The name is all an approval
// says about itself, so it is what they are grouped on; the count stays on the
// row because one you don't remember giving is the thing worth noticing.
function groupGrants(grants) {
  const byName = new Map();
  for (const grant of grants) {
    const app = byName.get(grant.name) || { name: grant.name, grants: [], latest: null };
    app.grants.push(grant);
    if (grant.grantedAt && (!app.latest || new Date(grant.grantedAt) > new Date(app.latest))) app.latest = grant.grantedAt;
    byName.set(grant.name, app);
  }
  return [...byName.values()];
}

const DAY = { day: "numeric", month: "short", year: "numeric" };

export default function ConnectPage() {
  const demo = useIsDemo();
  const [origin, setOrigin] = useState("");
  const [app, setApp] = useState("claude");
  const [grants, setGrants] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  const [unread, setUnread] = useState(false);
  const [disconnecting, setDisconnecting] = useState(null);
  const [accessError, setAccessError] = useState(null);
  const [error, setError] = useState(null);

  // The address is this site's own, read after mount so a preview deploy
  // describes itself rather than production.
  useEffect(() => setOrigin(window.location.origin), []);

  const loadGrants = useCallback(async () => {
    // A list that couldn't be read is not an empty one. The section hides when
    // nothing has access, so a failure has to say so or it would look the same.
    let data;
    try {
      const res = await fetch("/api/account/connections");
      if (!res.ok) throw new Error();
      data = await res.json();
    } catch {
      setUnread(true);
      return;
    }
    setUnread(false);
    setGrants(data.grants || []);
    // Connected somewhere: nothing left to nudge about.
    if (data.grants?.length) retireAll();
    setUnavailable(Boolean(data.unavailable));
  }, []);

  useEffect(() => {
    loadGrants();
  }, [loadGrants]);

  // Every approval the app holds, one at a time. Stops being a success if any
  // of them fails, and the list is read again either way, so the row left
  // behind is what is really still connected.
  async function disconnect(app) {
    setAccessError(null);
    setDisconnecting(app.name);
    let failed = 0;
    for (const grant of app.grants) {
      try {
        const res = await fetch(`/api/account/connections?client=${encodeURIComponent(grant.clientId)}`, { method: "DELETE" });
        if (!res.ok) failed += 1;
      } catch {
        failed += 1;
      }
    }
    if (failed) {
      const total = app.grants.length;
      setAccessError(
        failed === total
          ? `Couldn’t disconnect ${app.name}. It still has access.`
          : `Disconnected ${total - failed} of ${app.name}’s ${total} approvals. Try again for the rest.`
      );
    }
    await loadGrants();
    setDisconnecting(null);
  }

  const address = origin ? `${origin}/api/mcp${demo ? "/demo" : ""}` : "";
  const chosen = APPS.find((a) => a.id === app);
  const connected = groupGrants(grants || []);
  // Nothing to manage until something is connected: someone setting up for the
  // first time sees the steps and not an empty list under them.
  const showAccess = !demo && (unread || unavailable || accessError || connected.length > 0);

  return (
    <>
      <UtilityBar onError={setError} />

      <main className="page page-wide">
        <div className="top-nav">
          <h1>MCP Server</h1>
        </div>

        {/* Named for what it is, MCP, the word every AI app's settings use,
            and explained straight after. It was "Connect an AI" with a "What
            is MCP?" panel under it, which named the thing one way and then
            explained a word the title never used. */}
        <p className="connect-lede">
          Connect Claude, ChatGPT or any AI app that supports MCP to your Kivli library, so it works
          from what you&rsquo;ve saved rather than from memory.
        </p>

        {error && <p className="error">{error}</p>}

        {/* The question everyone arriving here has, answered in one paragraph
            before anything asks them to do something. */}
        <section className="connect-explain">
          <h2>What is MCP?</h2>
          <p>
            MCP, the Model Context Protocol, is an open standard that lets an AI app use tools outside
            itself. Connect Kivli once and your AI can look things up in your library while you talk
            to it: search your saves, open one with its screenshots, colours and type, and read a
            whole collection.{" "}
            {demo
              ? "Here it can only read, and it reads the demo library."
              : "Ask it to and it can save websites and resources too. It can't edit or delete anything you've already saved."}
          </p>
        </section>

        <h2 className="connect-heading">What your AI can do</h2>
        {/* The demo has the four reading cards only, laid out two by two
            rather than three and a stray one. */}
        <div className={`connect-cards${demo ? " connect-cards-pairs" : ""}`}>
          {ABILITIES.filter((a) => !(demo && a.writes)).map(({ Icon, title, body, example }) => (
            <article className="connect-card" key={title}>
              <span className="connect-card-icon">
                <Icon size={18} aria-hidden="true" />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
              <p className="connect-card-example">&ldquo;{example}&rdquo;</p>
            </article>
          ))}
        </div>

        <h2 className="connect-heading">Set it up in three steps</h2>
        <ol className="connect-setup">
          <li className="connect-step">
            <span className="connect-step-number" aria-hidden="true">1</span>
            <div className="connect-step-body">
              <h3>Copy your server address</h3>
              {address && <CopyField value={address} label="MCP server address" />}
              <p className="connect-note">
                {demo
                  ? "This is the demo library, so there's no sign-in."
                  : "It's yours alone: anything using it signs in as you."}
              </p>
            </div>
          </li>

          <li className="connect-step">
            <span className="connect-step-number" aria-hidden="true">2</span>
            <div className="connect-step-body">
              <h3>Add it to your AI app</h3>
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
            </div>
          </li>

          <li className="connect-step">
            <span className="connect-step-number" aria-hidden="true">3</span>
            <div className="connect-step-body">
              <h3>{demo ? "Ask away" : "Allow access, then ask"}</h3>
              <p className="connect-step-text">
                {demo
                  ? "Turn Kivli on in a chat and ask about the saves you see here. Any of the requests above is a good first one."
                  : "The first time your app uses Kivli, a Kivli page opens and asks you to allow it. After that, turn Kivli on in a chat and ask. Any of the requests above is a good first one."}
              </p>
            </div>
          </li>
        </ol>

        {showAccess && (
          <section className="connect-panel">
            <h2>Apps with access</h2>
            {unavailable ? (
              <p className="connect-note">Connecting apps isn&rsquo;t switched on for this Kivli yet.</p>
            ) : (
              <p className="connect-note connect-grants-note">AI apps that can read and add to your library.</p>
            )}
            {accessError && (
              <p className="error" role="alert">
                {accessError}
              </p>
            )}
            {unread && (
              <p className="error" role="alert">
                Couldn&rsquo;t check which apps have access. Reload the page to try again.
              </p>
            )}
            {connected.length > 0 && (
              <ul className="connect-grants">
                {connected.map((app) => (
                  <li key={app.name}>
                    <span className="connect-grant-name">{app.name}</span>
                    <span className="connect-grant-date">
                      {[
                        app.grants.length > 1 && `${app.grants.length} approvals`,
                        app.latest &&
                          `${app.grants.length > 1 ? "last allowed" : "Allowed"} ${new Date(app.latest).toLocaleDateString(undefined, DAY)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <button
                      type="button"
                      className="connect-revoke"
                      onClick={() => disconnect(app)}
                      disabled={Boolean(disconnecting)}
                      aria-label={`Disconnect ${app.name}`}
                    >
                      {disconnecting === app.name ? "Disconnecting…" : "Disconnect"}
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
