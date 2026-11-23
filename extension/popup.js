import { KIVLI } from "./config.js";
import { post } from "./api.js";
import { icon } from "./icons.js";
import { readPage } from "./reader.js";

// The panel. One screen: the page you're on, what to save it as, where to put
// it, Save. A Component opens Kivli, because a crop has to be drawn; the rest
// are saved from here. A Visual is picked here from the images already on your
// screen, so a page that turns Kivli away can still be saved from.

const KINDS = [
  {
    id: "site",
    one: "Website",
    tab: "Websites",
    blurb: "Captured on desktop and mobile, then tagged for you.",
    action: "Save Website",
    done: "Screenshots and tags arrive in a few minutes.",
  },
  {
    id: "component",
    one: "Component",
    tab: "Components",
    blurb: "Grab what you can see and crop it, or have Kivli capture the whole page.",
    action: "Grab This Screen",
    other: "Capture Full Page",
  },
  {
    id: "resource",
    one: "Resource",
    tab: "Resources",
    blurb: "Described and filed in a few seconds.",
    action: "Save Resource",
    done: "Kivli is describing it now.",
  },
  {
    id: "visual",
    one: "Visual",
    tab: "Visuals",
  },
];
const KIND = Object.fromEntries(KINDS.map((k) => [k.id, k]));
const LAST_KIND = "kind";

const main = document.getElementById("main");

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  for (const [name, value] of Object.entries(props.attrs || {})) node.setAttribute(name, value);
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

function openKivli(path) {
  chrome.tabs.create({ url: `${KIVLI}${path}` });
  window.close();
}

document.getElementById("home").addEventListener("click", () => openKivli("/"));

// What can't be saved, and why. A page only this browser can reach has nothing
// behind its address for Kivli to photograph.
function refusal(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return "Open a web page, then press the Kivli button.";
  }
  if (u.origin === KIVLI) return "This is Kivli. Open the page you want to save, then press the button there.";
  if (!/^https?:$/.test(u.protocol)) return "This isn't a web page, so there's nothing for Kivli to open.";
  const host = u.hostname;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[)/.test(host)
  ) {
    return "Only your own computer or network can open this page, so Kivli can't capture it.";
  }
  return null;
}

function notice(title, body, button) {
  main.replaceChildren(
    el(
      "section",
      { className: "notice" },
      el("h1", { textContent: title }),
      el("p", { textContent: body }),
      button && el("button", { type: "button", className: "primary", textContent: button.label, onclick: button.run })
    )
  );
}

// The app's own rule for a site with no icon: its first letter, on a colour
// that is the same every time.
function badgeFor(tab, domain) {
  const hue = [...domain].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  const letter = () => {
    const b = el("span", { className: "badge badge-letter", textContent: (domain[0] || "?").toUpperCase() });
    b.style.setProperty("--hue", hue);
    return b;
  };
  if (!tab.favIconUrl) return letter();
  const img = el("img", { src: tab.favIconUrl, alt: "" });
  const holder = el("span", { className: "badge" }, img);
  img.addEventListener("error", () => holder.replaceWith(letter()));
  return holder;
}

// A field that opens into a filtered list. The list floats over the panel and
// is kept inside it: in the flow it took the panel past the 600px Chrome allows,
// and Save went below the fold.
const EDGE = 12;
function picker({ label, empty, placeholder, options, create, onChange }) {
  let value = null;
  let active = -1;
  const id = `picker-${label.toLowerCase()}`;
  const text = el("span", { className: "picker-value", textContent: empty });
  const button = el(
    "button",
    { type: "button", className: "picker", id, attrs: { "aria-expanded": "false", "aria-label": `${label}: ${empty}` } },
    text,
    icon("chevron")
  );
  const input = el("input", { type: "text", placeholder, attrs: { "aria-label": placeholder } });
  const list = el("div", { className: "picker-list" });
  const panel = el("div", { className: "picker-panel", hidden: true }, input, list);

  const node = el("div", { className: "field" }, el("label", { textContent: label, htmlFor: id }), button, panel);

  function show(open) {
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) {
      input.value = "";
      active = -1;
      draw();
      const { bottom } = button.getBoundingClientRect();
      const room = document.body.scrollHeight - panel.offsetHeight - EDGE;
      panel.style.top = `${Math.max(EDGE, Math.min(bottom + window.scrollY + 6, room))}px`;
      input.focus({ preventScroll: true });
    }
  }

  function choose(next) {
    value = next;
    const shown = next ? next.label : empty;
    text.textContent = shown;
    text.classList.toggle("picker-set", Boolean(next));
    button.setAttribute("aria-label", `${label}: ${shown}`);
    show(false);
    button.focus();
    onChange?.(value);
  }

  function rows() {
    const needle = input.value.trim().toLowerCase();
    const found = options.filter((o) => o.label.toLowerCase().includes(needle));
    const out = needle ? [] : [{ label: empty, clear: true }];
    out.push(...found);
    if (create && needle && !options.some((o) => o.label.toLowerCase() === needle)) {
      out.push({ label: input.value.trim(), isNew: true });
    }
    return out;
  }

  function draw() {
    const items = rows();
    active = Math.min(Math.max(active, input.value ? 0 : -1), items.length - 1);
    list.replaceChildren(
      ...items.map((o, i) => {
        const held = o.clear ? !value : value && !o.isNew && value.id === o.id;
        return el(
          "button",
          {
            type: "button",
            className: `picker-option${i === active ? " active" : ""}${o.clear ? " picker-clear" : ""}`,
            tabIndex: -1,
            onclick: () => choose(o.clear ? null : o),
            onmousemove: () => i !== active && mark(i),
          },
          el("span", { className: "picker-check" }, o.isNew ? icon("plus", 14) : held && icon("check", 14)),
          el("span", { className: "picker-label", textContent: o.isNew ? `Create “${o.label}”` : o.label })
        );
      })
    );
    if (!items.length) list.append(el("p", { className: "picker-none", textContent: "Nothing matches that." }));
  }

  function mark(i) {
    active = i;
    [...list.children].forEach((row, n) => row.classList.toggle("active", n === i));
    list.children[i]?.scrollIntoView({ block: "nearest" });
  }

  button.addEventListener("click", () => show(panel.hidden));
  document.addEventListener("pointerdown", (e) => {
    if (!panel.hidden && !node.contains(e.target)) show(false);
  });
  node.addEventListener("focusout", (e) => {
    if (!panel.hidden && e.relatedTarget && !node.contains(e.relatedTarget)) show(false);
  });
  input.addEventListener("input", () => {
    active = 0;
    draw();
  });
  panel.addEventListener("keydown", (e) => {
    const items = rows();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length) mark((active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = items[active];
      if (o) choose(o.clear ? null : o);
    } else if (e.key === "Escape") {
      // Closes the list and not the whole panel, which is what Chrome would do.
      e.preventDefault();
      e.stopPropagation();
      show(false);
      button.focus();
    }
  });

  return { node, value: () => value };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// As tall as Chrome lets a panel be, less a hair.
const PANEL_MAX = 596;

// What one save takes, the same as Kivli's own picker.
const MAX_CLIPS = 8;

// The images on the page, to tick. Read once, the first time Visual is held:
// until then nothing on the page has been looked at.
function imagePicker(tabId, onChange) {
  const chosen = new Set();
  const grid = el("div", { className: "tiles" });
  const count = el("span", { attrs: { role: "status" } });
  const every = el("button", { type: "button", className: "link" });
  const bar = el("div", { className: "tiles-bar", hidden: true }, count, every);
  const says = el("p", { className: "blurb", textContent: "Looking through the page…" });
  const node = el("div", { className: "images" }, says, bar, grid);
  let page = null;
  let items = [];
  let reading = false;
  let dead = false;

  const clipCount = () => [...chosen].filter((i) => i.clip).length;

  function draw(note) {
    count.textContent = note || (chosen.size ? `${chosen.size} of ${items.length} chosen` : `${items.length} on this page`);
    every.textContent = chosen.size ? "Clear" : "All Images";
    every.hidden = !items.some((i) => !i.clip);
    [...grid.children].forEach((tile, i) => tile.setAttribute("aria-pressed", String(chosen.has(items[i]))));
    onChange();
  }

  function toggle(item) {
    if (chosen.has(item)) chosen.delete(item);
    else if (item.clip && clipCount() >= MAX_CLIPS) return draw(`Up to ${MAX_CLIPS} clips at a time`);
    else chosen.add(item);
    return draw();
  }

  // Images only: a clip is up to 15 MB of a small library, so each is a choice.
  every.addEventListener("click", () => {
    if (chosen.size) chosen.clear();
    else items.filter((i) => !i.clip).forEach((i) => chosen.add(i));
    draw();
  });

  function tile(item) {
    const picture = item.t
      ? el("img", { src: item.t, alt: "", loading: "lazy" })
      : item.clip
        ? el("video", { src: item.u, muted: true, preload: "metadata" })
        : null;
    const button = el(
      "button",
      {
        type: "button",
        className: "tile",
        attrs: { "aria-pressed": "false", "aria-label": item.a || item.h || (item.clip ? "Clip" : "Image") },
        onclick: () => toggle(item),
      },
      picture,
      item.clip && el("span", { className: "tile-clip" }, icon("play", 10)),
      el("span", { className: "tile-check" }, icon("check", 13))
    );
    // Not being shown here says nothing about whether it can be saved.
    picture?.addEventListener("error", () => {
      picture.replaceWith(el("span", { className: "tile-name", textContent: item.a || item.h || "No preview" }));
    });
    return button;
  }

  async function read() {
    if (page || reading || dead) return;
    reading = true;
    try {
      const [run] = await chrome.scripting.executeScript({ target: { tabId }, func: readPage });
      page = run?.result || null;
    } catch (err) {
      console.error("Kivli couldn’t read the page:", err);
    }
    reading = false;
    if (!page) {
      dead = true;
      says.textContent = "Kivli couldn’t look through this page. Reload the page and press the button again.";
      onChange();
      return;
    }
    items = [...page.images, ...page.videos.map((v) => ({ ...v, clip: true }))];
    if (!items.length) {
      dead = true;
      says.textContent = "No images big enough to keep were found. If the page loads as you scroll, scroll it and press the button again.";
      onChange();
      return;
    }
    says.hidden = true;
    bar.hidden = false;
    grid.replaceChildren(...items.map(tile));
    if (items.length === 1) chosen.add(items[0]);
    draw();
  }

  // Whatever height the rest of the panel leaves, so Save is never below the
  // fold: a long title, a row saying it's saved and a collection all take some.
  function fit() {
    if (!grid.children.length) return;
    const { scrollTop } = grid;
    grid.style.maxHeight = "0px";
    const rest = document.body.scrollHeight;
    grid.style.maxHeight = `${Math.max(112, Math.min(300, PANEL_MAX - rest))}px`;
    grid.scrollTop = scrollTop;
  }

  return {
    node,
    read,
    fit,
    dead: () => dead,
    missesClip: () => Boolean(page?.unreachable),
    count: () => chosen.size,
    clips: clipCount,
    // Only what was ticked leaves the browser.
    page: () => {
      const held = items.filter((i) => chosen.has(i)).map(({ t, c, l, ...rest }) => rest);
      const bare = ({ clip, ...rest }) => rest;
      return {
        ...page,
        images: held.filter((i) => !i.clip).map(bare),
        videos: held.filter((i) => i.clip).map(bare),
      };
    },
  };
}

// The two places Kivli reads a post's clip from that a page won't give up.
const readsClips = (url) => /(^|\.)(x|twitter|linkedin)\.com$/.test(new URL(url).hostname);

function savedLine(match) {
  if (match.kind === "component") return `${plural(match.count, "component")} from this page`;
  if (match.kind === "visual") return match.saved ? "Images saved from this page" : "Images waiting for you to choose";
  return `Already in ${KIND[match.kind].tab}`;
}

function render(tab, found, firstKind) {
  const url = tab.url;
  const domain = new URL(url).hostname.replace(/^www\./, "");
  let kind = firstKind;
  let busy = false;

  const head = el(
    "section",
    { className: "page" },
    badgeFor(tab, domain),
    el(
      "div",
      { className: "page-text" },
      el("h1", { textContent: tab.title || domain, title: tab.title || "" }),
      el("p", { textContent: domain })
    )
  );

  const saved =
    found.saved.length > 0 &&
    el(
      "ul",
      { className: "saved" },
      ...found.saved.map((m) =>
        el(
          "li",
          {},
          el(
            "button",
            { type: "button", onclick: () => openKivli(m.href) },
            icon("check", 14),
            el("span", { textContent: savedLine(m) }),
            icon("out", 15)
          )
        )
      )
    );

  const radios = KINDS.map((k) => {
    const input = el("input", { type: "radio", name: "kind", value: k.id, checked: k.id === kind });
    input.addEventListener("change", () => {
      kind = k.id;
      chrome.storage.local.set({ [LAST_KIND]: kind });
      update();
    });
    return el("label", { className: "kind" }, input, el("span", {}, icon(k.id, 18), k.one));
  });
  const kinds = el("div", { className: "kinds", attrs: { role: "radiogroup", "aria-label": "Save as" } }, ...radios);
  const blurb = el("p", { className: "blurb" });

  const collection = picker({
    label: "Collection",
    empty: "None",
    placeholder: "Filter or name a new collection…",
    options: found.collections.map((c) => ({ id: c.id, label: c.name })),
    create: true,
    onChange: () => update(),
  });
  const folder = picker({
    label: "Folder",
    empty: "Let AI choose",
    placeholder: "Filter your folders…",
    options: found.folders.map((f) => ({ id: f.id, label: f.label })),
  });
  const note = el("textarea", { rows: 2, id: "note", placeholder: "Why it’s worth keeping", maxLength: 5000 });
  const noteField = el("div", { className: "field" }, el("label", { textContent: "Note", htmlFor: "note" }), note);

  const error = el("p", { className: "error", hidden: true, attrs: { role: "alert" } });
  const submit = el("button", { type: "submit", className: "primary" });
  const other = el("button", { type: "button", className: "other", onclick: () => go("kivli") });
  const images = imagePicker(tab.id, () => update());
  const form = el("form", {}, kinds, blurb, images.node, folder.node, collection.node, noteField, error, submit, other);

  // The save already here for the kind that's held, if there is one. What's
  // left to do with it is file it, so the rest of the form goes.
  const match = () => found.saved.find((m) => m.kind === kind && m.id);

  function update() {
    const existing = match();
    const noted = kind === "site" || kind === "resource";
    const visual = kind === "visual";
    if (visual) images.read();
    const clips = visual && images.clips() > 0;
    blurb.textContent = existing ? "You can still add it to a collection." : KIND[kind].blurb || "";
    blurb.hidden = !blurb.textContent;
    images.node.hidden = !visual;
    folder.node.hidden = kind !== "resource" || Boolean(existing);
    // Not with a clip: that save finishes in Kivli, and is filed there.
    const dead = visual && images.dead();
    collection.node.hidden = kind === "component" || clips || dead;
    noteField.hidden = !noted || Boolean(existing);
    // For a visual, only where Kivli can do what this panel can't: the clip in
    // a post it knows how to read. Anywhere else it would be a second button
    // that fails on exactly the pages the first one is for.
    const second = visual ? (readsClips(url) && images.missesClip() ? "Get This Post’s Clip in Kivli" : null) : KIND[kind].other;
    other.hidden = !second;
    other.textContent = second || "";
    submit.hidden = dead;
    other.disabled = busy;
    submit.textContent = action({ existing, visual, clips });
    submit.disabled = busy || Boolean(existing && !collection.value()) || (visual && !images.count());
    error.hidden = true;
    if (visual) images.fit();
  }

  function action({ existing, visual, clips }) {
    if (busy) return kind === "component" ? "Starting…" : "Saving…";
    if (existing) return "Add to Collection";
    if (!visual) return KIND[kind].action;
    if (clips) return "Continue in Kivli";
    return images.count() ? `Save ${plural(images.count(), "Image")}` : "Choose Images Above";
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!submit.disabled) go(kind === "component" ? "grab" : kind === "visual" ? "chosen" : null);
  });

  // `how` is which of a kind's two ways: from this screen, or by Kivli opening
  // the page itself.
  async function go(how) {
    if (busy) return;
    const chosen = collection.value();
    const existing = match();
    if (existing && chosen?.id && existing.collections?.includes(chosen.id)) {
      error.textContent = `It’s already in ${chosen.label}.`;
      error.hidden = false;
      return;
    }
    busy = true;
    const was = kind;
    update();
    form.inert = true;
    let result;
    try {
      result = await chrome.runtime.sendMessage({
        type: "save",
        payload: {
          kind: was,
          how,
          url,
          windowId: tab.windowId,
          page: how === "chosen" ? images.page() : null,
          title: tab.title || "",
          note: existing ? "" : note.value,
          folderId: was === "resource" && !existing ? folder.value()?.id : null,
          collectionId: chosen?.isNew ? null : chosen?.id,
          collectionName: chosen?.isNew ? chosen.label : null,
        },
      });
    } catch {
      result = null;
    }
    busy = false;
    form.inert = false;
    if (result?.opened) {
      window.close();
      return;
    }
    if (result?.ok) {
      finished(result.data, was, chosen);
      return;
    }
    update();
    if (result?.signedOut) {
      signIn();
      return;
    }
    error.textContent = result?.error || "Something went wrong saving that. Try again.";
    error.hidden = false;
    images.fit();
  }

  // Command or Control with Return saves from inside the note, where Return
  // alone is a new line.
  note.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) form.requestSubmit();
  });

  main.replaceChildren(...[head, saved, form].filter(Boolean));
  update();

  // Return saves straight away. Not by focusing the button, which opened the
  // panel with a ring around it before anyone had touched a key.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && document.activeElement === document.body && form.isConnected && !submit.disabled) form.requestSubmit();
  });
}

function finished(data, kind, chosen) {
  if (kind === "visual") {
    const where = data.collectionId && chosen ? chosen.label : null;
    done({
      title: data.saved ? `Saved ${plural(data.saved, "image")}` : "Already in Visuals",
      lines: [data.saved && "Kivli is describing and tagging them now.", where && `They’re in ${where}.`, data.warning],
      href: "/?tab=visuals",
    });
    return;
  }
  const where = data.collectionId && chosen ? chosen.label : null;
  const title = data.existing
    ? where
      ? `Added to ${where}`
      : `Already in ${KIND[kind].tab}`
    : `Saved to ${KIND[kind].tab}`;
  const lines = [];
  if (!data.existing) lines.push(KIND[kind].done);
  if (!data.existing && where) lines.push(`It’s in ${where}.`);
  if (data.warning) lines.push(data.warning);

  done({ title, name: data.name, lines, href: kind === "site" ? `/sites/${data.id}` : "/?tab=resources" });
}

function done({ title, name, lines, href }) {
  const said = lines.filter(Boolean).join(" ");
  const close = el("button", { type: "button", className: "primary", textContent: "Done", onclick: () => window.close() });
  main.replaceChildren(
    el(
      "section",
      { className: "finished", attrs: { role: "status" } },
      el("span", { className: "tick" }, icon("check", 22)),
      el("h1", { textContent: title }),
      name && el("p", { className: "finished-name", textContent: name }),
      said && el("p", { textContent: said }),
      el(
        "div",
        { className: "finished-actions" },
        el("button", {
          type: "button",
          className: "secondary",
          textContent: "Open in Kivli",
          onclick: () => openKivli(href),
        }),
        close
      )
    )
  );
  close.focus({ focusVisible: false });
}

function signIn() {
  notice("Sign in to Kivli", "Once you’re signed in, come back to this page and press the button again.", {
    label: "Sign In",
    run: () => openKivli("/login"),
  });
}

// Chrome serves an unpacked extension's panel straight off the disk but goes on
// running its old manifest and worker until it is reloaded, so for that long the
// panel asks for things it hasn't been given. It looked like the page's fault.
async function halfUpdated() {
  try {
    const onDisk = await (await fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" })).json();
    return onDisk.version !== chrome.runtime.getManifest().version;
  } catch {
    return false;
  }
}

function loading() {
  main.replaceChildren(
    el("div", { className: "loading", attrs: { "aria-label": "Loading", role: "status" } }, ...[46, 64, 18, 58, 58, 42].map((h) => {
      const bone = el("span", { className: "bone" });
      bone.style.height = `${h}px`;
      return bone;
    }))
  );
}

// Something that failed after the panel had closed. Said once, here.
async function lastFailure() {
  const { failed } = await chrome.storage.session.get("failed");
  if (!failed) return;
  await chrome.storage.session.remove("failed");
  await chrome.action.setBadgeText({ text: "" });
  main.prepend(
    el(
      "p",
      { className: "error error-last", attrs: { role: "alert" } },
      el("strong", { textContent: `Couldn’t save ${failed.title || "the last page"}. ` }),
      failed.error || ""
    )
  );
}

async function start() {
  // Held open so the worker knows someone is watching and the icon can stay
  // quiet about how it went.
  chrome.runtime.connect({ name: "panel" });

  if (await halfUpdated()) {
    notice("Kivli has been updated", "Finish updating, then press the Kivli button again.", {
      label: "Finish Updating",
      run: () => chrome.runtime.reload(),
    });
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const no = refusal(tab?.url || "");
  if (no) {
    notice("Nothing to save here", no);
    await lastFailure();
    return;
  }

  loading();
  const [res, stored] = await Promise.all([
    post("/api/extension/lookup", { url: tab.url }),
    chrome.storage.local.get(LAST_KIND),
  ]);
  if (res.signedOut) {
    signIn();
    return;
  }
  if (!res.ok) {
    notice("Couldn’t open your library", res.error, { label: "Try Again", run: start });
    return;
  }

  document.getElementById("who").textContent = res.data.account || "";
  const last = stored[LAST_KIND];
  const already = res.data.saved.find((m) => m.id)?.kind;
  render(tab, res.data, already || res.data.suggested || (KIND[last] ? last : "site"));
  await lastFailure();
}

start();
