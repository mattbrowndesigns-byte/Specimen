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

async function save({ kind, url, title, note, folderId, collectionId, collectionName }) {
  if (kind === "component") {
    const res = await post("/api/components/capture", { url });
    if (!res.ok) return res;
    const { id, domain } = res.data.capture;
    await open(`/?${new URLSearchParams({ job: `component:${id}`, label: domain || "" })}`);
    return { ok: true, opened: true };
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
