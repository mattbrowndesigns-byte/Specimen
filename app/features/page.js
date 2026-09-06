"use client";
import UtilityBar from "../_ui/UtilityBar";
import SiteFooter from "../_ui/SiteFooter";
import { FEATURE_GROUPS } from "@/lib/features";

// The whole list, in one place.
//
// The rotator shows one of these at a time while a capture runs, which is a
// fine way to learn something by accident and a poor way to find out what the
// thing actually does. Same source list, laid out properly.
export default function FeaturesPage() {
  return (
    <>
      <UtilityBar />

      <main className="page prose-page">
        <header className="prose-head">
          <h1>Everything Kivli Does</h1>
          <p className="prose-lede">
            You paste a URL. Kivli captures the page, reads it, and files it so that finding it
            again six months later takes seconds rather than an afternoon of scrolling.
          </p>
        </header>

        {FEATURE_GROUPS.map((group) => (
          <section className="feature-group" key={group.title}>
            <div className="feature-group-head">
              <h2>{group.title}</h2>
              <p>{group.blurb}</p>
            </div>

            <div className="feature-grid">
              {group.features.map(({ Icon, name, blurb }) => (
                <article className="feature-card" key={name}>
                  <span className="feature-card-icon">
                    <Icon size={18} />
                  </span>
                  <h3>{name}</h3>
                  <p>{blurb}</p>
                </article>
              ))}
            </div>
          </section>
        ))}

        <section className="prose-cta">
          <h2>That&rsquo;s the tour</h2>
          <p>
            Nothing here needs setting up. Save something and the rest happens on its own — and
            everything written for you waits in the review queue until you&rsquo;ve had a look.
          </p>
          <a className="prose-cta-link" href="/">
            Back to your library
          </a>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
