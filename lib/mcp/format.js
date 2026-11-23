// Small text helpers for the MCP tools' answers.

export function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function latestCaptureOf(site, viewport) {
  return (site.capture || [])
    .filter((c) => c.viewport === viewport && c.full_url)
    .sort((a, b) => String(b.captured_at).localeCompare(String(a.captured_at)))[0];
}

function short(value, max = 220) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

// One search result: enough to choose between them, with the id the next
// call needs. Approved tags only -- a proposal nobody has looked at is not
// yet a word this library uses.
export function itemLine(kind, row, href) {
  const name = row.name || row.title || row.domain || "Untitled";
  const where = row.domain || (row.source_url ? safeHost(row.source_url) : "");
  const tags = (row.tags || []).filter((t) => t && t.is_approved !== false).map((t) => t.label);
  const lines = [`- **${short(name, 90)}**${where ? ` — ${where}` : ""}`, `  id: ${row.id} · ${href}`];
  if (row.project?.title) lines.push(`  Project: ${row.project.title}`);
  if (row.agency_name) lines.push(`  Agency: ${row.agency_name}`);
  if (tags.length) lines.push(`  Tags: ${tags.join(", ")}`);
  if (row.summary) lines.push(`  ${short(row.summary)}`);
  return lines.join("\n");
}

function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
