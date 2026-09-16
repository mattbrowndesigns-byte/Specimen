"use client";
import { useEffect, useMemo, useState, use as usePromise } from "react";
import { ArrowUpRight } from "lucide-react";
import Favicon from "../../_ui/Favicon";
import TagRow from "../../_ui/TagRow";
import Wordmark from "../../_ui/Wordmark";
import { latestCapture } from "@/lib/captures";

// What someone without an account sees.
//
// Read-only by construction rather than by hiding buttons: this page has no
// mutating call in it at all, and the API behind it returns a narrower row than
// the owner's own view -- no notes, no review state, nothing hidden.
//
// It is also the only page most people will ever see, which is why the
// wordmark is the real animated one rather than a styled string, and why
// there's an invitation at the bottom instead of a dead end.

const TAB_LABELS = { sites: "Websites", components: "Components", resources: "Resources" };

export default function SharedPage({ params }) {
  const { token } = usePromise(params);
  const [state, setState] = useState({ status: "loading" });
  const [tab, setTab] = useState(null);

  useEffect(() => {
    fetch(`/api/shared/${token}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return setState({ status: "gone", message: data.error });
        setState({ status: "ready", ...data });
      })
      .catch(() => setState({ status: "gone" }));
  }, [token]);

  const sites = state.sites || [];
  const components = state.components || [];
  const resources = state.resources || [];

  // Only the kinds that actually have something in them. A library share from
  // an account with no components shouldn't offer an empty Components tab --
  // the scope says what was shared, the contents say what's worth showing.
  const tabs = useMemo(
    () =>
      [
        ["sites", sites.length],
        ["components", components.length],
        ["resources", resources.length],
      ].filter(([, count]) => count > 0),
    [sites.length, components.length, resources.length]
  );

  const active = tab && tabs.some(([id]) => id === tab) ? tab : tabs[0]?.[0];
  const total = sites.length + components.length + resources.length;

  if (state.status === "loading") {
    return (
      <main className="page page-wide shared-page">
        <p className="empty-small">Loading…</p>
      </main>
    );
  }

  if (state.status === "gone") {
    return (
      <main className="page shared-page shared-gone">
        <a className="shared-brand wordmark-link" href="/">
          <Wordmark className="shared-mark" />
        </a>
        <h2>This link isn&rsquo;t available</h2>
        <p>{state.message || "It may have been revoked by whoever shared it."}</p>
      </main>
    );
  }

  const named = state.kind === "collection" || state.kind === "folder";

  return (
    <>
      {/* Not the utility bar: none of what's in it applies to someone without
          an account, and offering Add to a reader who can't save is worse than
          offering nothing. What does belong is a way in. */}
      <header className="shared-bar">
        <div className="shared-bar-inner">
          <a className="shared-brand wordmark-link" href="/">
            <Wordmark className="shared-mark" />
          </a>
          <div className="shared-bar-side">
            <span className="shared-bar-meta">
              {total} {total === 1 ? "item" : "items"}, shared with you
            </span>
            <a className="shared-cta-btn" href="/login">
              Get Kivli
            </a>
          </div>
        </div>
      </header>

      <main className="page page-wide shared-page">
        <h1 className="page-hero shared-title">{state.title}</h1>
        {named && state.ownerName && (
          <p className="shared-byline">Shared by {state.ownerName}</p>
        )}

        {tabs.length > 1 && (
          <div className="tab-switcher">
            {tabs.map(([id, count]) => (
              <button
                key={id}
                className={active === id ? "active" : ""}
                onClick={() => setTab(id)}
              >
                {TAB_LABELS[id]}
                <span className="tab-count">{count}</span>
              </button>
            ))}
          </div>
        )}

        {total === 0 && <p className="empty">Nothing has been added to this yet.</p>}

        {active === "sites" && (
          <div className="grid grid-medium">
            {sites.map((site) => (
              <SharedCard
                key={site.id}
                href={site.url}
                thumb={latestCapture(site.capture, "desktop")?.thumb_url}
                name={site.name || site.domain}
                faviconUrl={site.favicon_url}
                fills={site.favicon_fills !== false}
                tags={site.tags}
              />
            ))}
          </div>
        )}

        {active === "components" && (
          <div className="grid grid-medium">
            {components.map((component) => (
              <SharedCard
                key={component.id}
                href={component.source_url}
                thumb={component.image_url}
                natural
                name={component.name || "Untitled component"}
                faviconUrl={component.favicon_url}
                fills={component.favicon_fills !== false}
                tags={component.tags}
              />
            ))}
          </div>
        )}

        {/* Rows, exactly as the owner sees them, minus every control. A
            resource is a link and the link is the whole of it. */}
        {active === "resources" && (
          <div className="resource-list">
            {resources.map((resource) => (
              <div className="resource-row" key={resource.id}>
                <Favicon
                  url={resource.url}
                  faviconUrl={resource.favicon_url}
                  fills={resource.favicon_fills !== false}
                  alt={resource.title}
                />
                <div className="resource-body">
                  <span className="resource-head">
                    <a
                      className="resource-title"
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                    >
                      {resource.title}
                    </a>
                    <span className="resource-domain">{resource.domain}</span>
                  </span>
                  {resource.summary && (
                    <span className="resource-summary">{resource.summary}</span>
                  )}
                  {(resource.tags || []).length > 0 && (
                    <span className="resource-tags">
                      {resource.tags.map((tag) => (
                        <span className="chip" key={tag.id}>
                          {tag.label}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* The end of someone else's library is the one moment a stranger is
            most likely to want their own, so it says so plainly -- and says
            what it actually takes, because pointing at a signup form that
            needs a code nobody has is worse than not asking. */}
        <section className="shared-invite">
          <Wordmark className="shared-invite-mark" as="p" />
          <h2>Want one of your own?</h2>
          <p>
            Kivli captures any site you paste, reads its colours and typefaces, tags it for you, and
            finds it again months later in about five seconds. It&rsquo;s invite-only while
            it&rsquo;s still being built.
          </p>
          <div className="shared-invite-actions">
            <a className="shared-invite-primary" href="/login">
              Redeem an invite
            </a>
            <a className="shared-invite-secondary" href="/features">
              See what it does
            </a>
          </div>
        </section>
      </main>
    </>
  );
}

function SharedCard({ href, thumb, natural, name, faviconUrl, fills, tags }) {
  return (
    <div className="card">
      <div className="card-media">
        <a
          className={`thumb${natural ? " thumb-natural" : ""}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt={name} />
          ) : (
            <div className="placeholder">No capture</div>
          )}
        </a>
      </div>
      <div className="card-footer">
        <span className="card-title">
          <Favicon url={href} faviconUrl={faviconUrl} fills={fills} alt={name} />
          <span className="name">{name}</span>
        </span>
        <a
          className="visit"
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          title="Open it"
        >
          <ArrowUpRight size={15} />
        </a>
      </div>
      <TagRow tags={tags || []} href={href} />
    </div>
  );
}
