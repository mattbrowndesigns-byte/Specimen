import { KIVLI } from "./config.js";
import { post } from "./api.js";

// Saving happens here and not in the panel, because the panel is gone the
// moment you click back into the page. If it has gone by the time a save ends,
// the icon says how it went.

const panels = new Set();
chrome.runtime.onConnect.addListener((port) => {
  panels.add(port);
  port.onDisconnect.addListener(() => panels.delete(port));
});

const BADGE_MS = 6000;

function badge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeTextColor({ color: "#ffffff" });
  chrome.action.setBadgeText({ text });
}

async function report(result, title) {
  if (panels.size) return;
  if (result.ok) {
    badge("✓", "#1f6b33");
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), BADGE_MS);
    return;
  }
  // Stays until the panel is next opened, which is where the reason is.
  badge("!", "#c0392b");
  await chrome.storage.session.set({ failed: { title, error: result.error } });
}

async function open(path) {
  await chrome.tabs.create({ url: `${KIVLI}${path}` });
}

// What's on screen, as an image ready to crop. It goes the way an uploaded
// component does: straight into Storage on an address Kivli signs, then Kivli
// is told it's there.
async function grab({ url, windowId }) {
  let shot;
  try {
    const picture = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
    shot = await (await fetch(picture)).blob();
  } catch {
    return { ok: false, error: "Chrome wouldn't let Kivli photograph this page." };
  }
  const start = await post("/api/components/upload", {
    files: [{ name: "Screen grab.png", type: "image/png", size: shot.size }],
  });
  if (!start.ok) return start;
  const { path, signedUrl } = start.data.uploads[0];
  const sent = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/png", "x-upsert": "true" },
    body: shot,
  }).catch(() => null);
  if (!sent?.ok) return { ok: false, error: "The screen grab didn't upload. Try again." };
  const done = await post("/api/components/upload/process", { path, name: "Screen grab", pageUrl: url });
  if (!done.ok) return done;
  await open(`/components/crop/${done.data.capture.id}`);
  return { ok: true, opened: true };
}

async function save({ kind, how, url, title, note, folderId, collectionId, collectionName, page, windowId }) {
  if (kind === "component" && how === "grab") return grab({ url, windowId });

  if (kind === "component") {
    const res = await post("/api/components/capture", { url });
    if (!res.ok) return res;
    await open(`/components/crop/${res.data.capture.id}`);
    return { ok: true, opened: true };
  }

  if (kind === "visual" && how === "chosen") {
    const res = await post("/api/extension/visuals", { page, collectionId, collectionName });
    if (!res.ok) return res;
    // A clip among them: Kivli's picker draws its frames, and has them ticked.
    if (res.data.open) {
      await open(res.data.open);
      return { ok: true, opened: true };
    }
    if (res.data.saved) post(`/api/visuals/projects/${res.data.projectId}/describe`);
    return res;
  }

  if (kind === "visual") {
    const res = await post("/api/visuals", { url });
    if (!res.ok) return res;
    await open(`/visuals/projects/${res.data.project.id}`);
    return { ok: true, opened: true };
  }

  const res = await post("/api/extension/save", {
    kind,
    url,
    pageTitle: title,
    note,
    folderId,
    collectionId,
    collectionName,
  });
  // Describing it is a second request, as it is in the app, so "Saved" doesn't
  // wait on a model. Nothing here waits for it either.
  if (res.ok && kind === "resource" && !res.data.existing) {
    post(`/api/resources/${res.data.id}/enrich`);
  }
  return res;
}

// Chrome stops an idle worker after thirty seconds, and a slow page can take
// longer than that to answer. Any extension call counts as activity.
async function awake(work) {
  const tick = setInterval(() => chrome.runtime.getPlatformInfo(), 20000);
  try {
    return await work;
  } finally {
    clearInterval(tick);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.type !== "save") return false;
  awake(save(message.payload))
    .catch(() => ({ ok: false, error: "Something went wrong saving that. Try again." }))
    .then(async (result) => {
      await report(result, message.payload.title);
      reply(result);
    });
  return true;
});
