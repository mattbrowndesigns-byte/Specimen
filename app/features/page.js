"use client";
import { ArrowDown } from "lucide-react";
import { FEATURE_GROUPS } from "@/lib/features";
import { KIND } from "../_ui/kinds";

// Two halves. First the four kinds of save, as an overview you can jump from
// and then a section each; then what works on all of them. Someone arriving
// cold should learn that there are four kinds of thing to keep before they
// read a word about what happens to them.
const kinds = FEATURE_GROUPS.filter((group) => group.kind);
const shared = FEATURE_GROUPS.filter((group) => !group.kind);

function Group({ group }) {
  const Icon = group.kind ? KIND[group.kind].Icon : null;
  return (
    <section className="prose-row feature-group" id={group.id}>
      <div className="feature-group-head prose-row-aside">
        <h3>
          {Icon && <Icon size={24} aria-hidden="true" />}
          {group.title}
        </h3>
        <p>{group.blurb}</p>
      </div>

      <div className="feature-grid">
        {group.features.map(({ Icon: FeatureIcon, name, blurb }) => (
          <article className="feature-card" key={name}>
            <span className="feature-card-icon">
              <FeatureIcon size={18} />
            </span>
            <h4>{name}</h4>
            <p>{blurb}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function FeaturesPage() {
  return (
    <>
      <main className="page prose-page">
        <header className="prose-head">
          <h1>Everything Kivli Does</h1>
          <p className="prose-lede">
            Four kinds of thing worth keeping: whole websites, pieces of them, useful links, and the
            work itself. Kivli takes each one in, writes it up and files it, so that finding it again
            six months later takes seconds rather than an afternoon of scrolling.
          </p>
        </header>

        <h2 className="feature-part">What you can save</h2>
        <nav className="feature-kinds" aria-label="Kinds of save">
          {kinds.map((group) => {
            const { Icon } = KIND[group.kind];
            return (
              <a className="feature-kind" href={`#${group.id}`} key={group.id}>
                <span className="feature-card-icon">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <strong>{group.title}</strong>
                <span className="feature-kind-line">{group.line}</span>
                <ArrowDown size={16} className="feature-kind-arrow" aria-hidden="true" />
              </a>
            );
          })}
        </nav>

        {kinds.map((group) => (
          <Group group={group} key={group.id} />
        ))}

        <h2 className="feature-part feature-part-rule">Across your whole library</h2>
        {shared.map((group) => (
          <Group group={group} key={group.id} />
        ))}

        <section className="prose-cta">
          <h2>That&rsquo;s the tour</h2>
          <p>
            Nothing here needs setting up. Save something and the rest happens on its own, and
            anything written for you is yours to change.
          </p>
          <a className="prose-cta-link" href="/">
            Back to your library
          </a>
        </section>
      </main>
    </>
  );
}
