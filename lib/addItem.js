// Starts a save from the Add menu and describes the resulting capture job the
// same way whichever page you were on. Shared because Add now lives in the
// utility bar on every page, but only the dashboard can show progress for it.
export async function addItem(kind, url) {
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
  return {
    capture: data.capture,
    job: {
      key: `cap-${data.capture.id}`,
      kind: "component",
      id: data.capture.id,
      label: data.capture.domain,
    },
  };
}

// The dashboard is where capture progress is shown, so an Add from any other
// page hands the job over in the query string rather than dropping it.
export function jobHandoffUrl(job) {
  const params = new URLSearchParams({ job: `${job.kind}:${job.id}` });
  if (job.label) params.set("label", job.label);
  return `/?${params.toString()}`;
}

export function jobFromSearch(search) {
  const params = new URLSearchParams(search);
  const raw = params.get("job");
  if (!raw) return null;
  const [kind, id] = raw.split(":");
  if (!id || (kind !== "website" && kind !== "component")) return null;
  return {
    key: `${kind === "website" ? "site" : "cap"}-${id}`,
    kind,
    id,
    label: params.get("label") || "",
  };
}
