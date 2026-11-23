"use client";
import { FEATURE_GROUPS } from "@/lib/features";

// One shape, repeated: a heading, a line under it, and its cards. The four
// kinds of save come first and what works on all of them after, and the order
// does that telling on its own.
//
// No closing panel. The other written pages end by pointing somewhere; from
// here the only thing left to do is use the app, and the logo already goes
// there.
export default function FeaturesPage() {
  return (
    <main className="page prose-page">
      <header className="prose-head">
        <h1>Features</h1>
        <p className="prose-lede">
          Save websites, components, resources and visuals. Kivli files them so you find them again in seconds.
        </p>
      </header>

      {FEATURE_GROUPS.map((group) => (
        <section className="feature-group" id={group.id} key={group.id}>
          <h2>{group.title}</h2>
          <p className="feature-group-blurb">{group.blurb}</p>

          <div className="feature-grid">
            {group.features.map(({ Icon, name, blurb }) => (
              <article className="feature-card" key={name}>
                <span className="feature-card-icon">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <h3>{name}</h3>
                <p>{blurb}</p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
