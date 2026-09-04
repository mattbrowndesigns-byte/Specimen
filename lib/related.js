// Ranks the rest of the library against one record, so a detail page can end
// with somewhere to go next.
//
// Two signals. Shared tags are the strong one -- they're a closed, curated
// vocabulary, so an overlap is a real editorial judgement rather than a
// coincidence of wording. Shared words from the name, summary and notes are
// the weak one, and they're weighted by how rare the word is across the whole
// library (classic inverse document frequency): "bento" separating two records
// means something, "design" appearing in every summary means nothing. That's
// why there's no stopword list -- a word common enough to be noise scores near
// zero on its own.

const TAG_WEIGHT = 3;
// Wording can contribute at most one shared tag's worth, which keeps tags the
// primary ranking and wording the tiebreak. Without the cap a record with two
// shared tags and some rare vocabulary in common outranks one with three
// shared tags, which reads as wrong even when the score is defensible.
const MAX_WORD_SCORE = TAG_WEIGHT;
const MIN_WORD_LENGTH = 4;

function words(item) {
  const text = [item.name, item.summary, item.notes].filter(Boolean).join(" ").toLowerCase();
  const found = text.match(/[a-z]+/g) || [];
  return new Set(found.filter((w) => w.length >= MIN_WORD_LENGTH));
}

function tagIds(item) {
  return new Set((item.tags || []).map((t) => t.id));
}

// `pool` is every candidate (both sites and components -- the tag vocabulary is
// shared across them, so a component can be the most relevant neighbour a site
// has). Each entry is { kind, item }.
export function rankRelated(subject, pool, limit = 6) {
  const candidates = pool.filter((c) => !(c.kind === subject.kind && c.item.id === subject.item.id));
  if (candidates.length === 0) return [];

  // Document frequency over the subject plus every candidate, so a word's
  // weight reflects this library rather than English in general.
  const documents = [subject, ...candidates].map((c) => words(c.item));
  const documentFrequency = new Map();
  for (const doc of documents) {
    for (const word of doc) {
      documentFrequency.set(word, (documentFrequency.get(word) || 0) + 1);
    }
  }
  const total = documents.length;

  const subjectWords = documents[0];
  const subjectTags = tagIds(subject.item);

  return candidates
    .map((candidate, i) => {
      const shared = [...tagIds(candidate.item)].filter((id) => subjectTags.has(id));
      let wordScore = 0;
      for (const word of documents[i + 1]) {
        if (!subjectWords.has(word)) continue;
        // log(N/df): 0 for a word in every record, growing as it gets rarer.
        wordScore += Math.log(total / documentFrequency.get(word));
      }
      const score = shared.length * TAG_WEIGHT + Math.min(wordScore, MAX_WORD_SCORE);
      return { ...candidate, score, sharedTagCount: shared.length };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || b.sharedTagCount - a.sharedTagCount)
    .slice(0, limit);
}
