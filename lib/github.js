// Fires GitHub's repository_dispatch endpoint, which triggers the
// capture-dispatch.yml workflow to run capture.js in GitHub Actions.
// targetType is 'site' (default, feeds the dashboard) or 'component_source'
// (a one-off capture of a page to crop a component out of).
export async function dispatchCapture({ targetId, url, targetType = "site" }) {
  const res = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPO}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        event_type: "capture-site",
        client_payload: { target_id: targetId, target_type: targetType, url },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub dispatch failed: ${res.status} ${text}`);
  }
}

// Triggers analyze-dispatch.yml, which reads a site's palette and typefaces
// without taking new screenshots. Separate from capture so a site saved before
// this existed can be analysed without a re-capture -- and so re-reading the
// style of a site whose design changed doesn't cost a new capture run.
export async function dispatchAnalyze({ targetId, url }) {
  const res = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPO}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        event_type: "analyze-site",
        client_payload: { target_id: targetId, url },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`GitHub dispatch failed: ${res.status} ${await res.text()}`);
  }
}
