// Starts a save from the Add menu and describes the resulting capture job the
// same way whichever page you were on. Shared because Add now lives in the
// utility bar on every page, but only the dashboard can show progress for it.
export async function addItem(kind, url) {
  // A visuals save goes straight to its picker: there's nothing to watch on
  // the dashboard, because the next thing that happens is you choosing.
  if (kind === "visual") {
    const res = await fetch("/api/visuals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || "Couldn't start that save" };
    return { redirect: `/visuals/projects/${data.project.id}` };
  }

  // A resource has no capture, so there's no job to report progress for: the
  // row exists by the time this returns, and the tab describes it afterwards.
  if (kind === "resource") {
    const res = await fetch("/api/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || "Couldn't save that link" };
    return { resource: { ...data.resource, tags: [] } };
  }

  if (kind === "website") {
    const res = await fetch("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || "Couldn't save that URL" };
    return {
      site: data.site,
      job: {
        key: `site-${data.site.id}`,
        kind: "website",
        id: data.site.id,
        label: data.site.name || data.site.domain,
      },
    };
  }

  const res = await fetch("/api/components/capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error || "Couldn't start that capture" };
  // Like a visual: the next thing that happens is you choosing, so it goes to
  // the page where that is done and is watched from there.
  return { redirect: cropUrl(data.capture.id) };
}

// Where a capture is cropped, whoever is sending you there.
export const cropUrl = (id) => `/components/crop/${id}`;

// The dashboard is where capture progress is shown, so an Add from any other
// page hands the job over in the query string rather than dropping it.
export function jobHandoffUrl(job) {
  const params = new URLSearchParams({ job: `${job.kind}:${job.id}` });
  if (job.label) params.set("label", job.label);
  return `/?${params.toString()}`;
}

// A resource has no job to watch, so its handoff carries only an id: the
// dashboard opens the Resources tab and describes that row. Same mechanism,
// nothing to wait for.
export function resourceHandoffUrl(resource) {
  return `/?resource=${resource.id}`;
}

export function resourceFromSearch(search) {
  return new URLSearchParams(search).get("resource");
}

export function jobFromSearch(search) {
  const params = new URLSearchParams(search);
  const raw = params.get("job");
  if (!raw) return null;
  const [kind, id] = raw.split(":");
  if (!id || kind !== "website") return null;
  return { key: `site-${id}`, kind, id, label: params.get("label") || "" };
}

// An extension from before the crop had a page of its own sends a capture to
// the dashboard, as ?crop=<id> or ?job=component:<id>.
export function cropFromSearch(search) {
  const params = new URLSearchParams(search);
  const [kind, id] = (params.get("job") || "").split(":");
  return params.get("crop") || (kind === "component" && id) || null;
}
