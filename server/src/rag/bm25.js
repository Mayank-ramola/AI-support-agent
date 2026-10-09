// Small BM25 keyword search. Used on its own when no embedding key is set, and as a fallback.
const STOPWORDS = new Set(
  "a an and are as at be but by can do does for from has have how i if in is it its me my of on or our so that the their them then there these they this to us was we what when where which who why will with you your does did take takes much many get got need want please tell about".split(" ")
);

export function stem(word) {
  return word.replace(/(ing|edly|ed|es|s)$/i, (m, _s, offset) => (offset >= 3 ? "" : m));
}

export function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => !STOPWORDS.has(t)).map(stem);
}

export class BM25 {
  constructor(docs, { k1 = 1.4, b = 0.75 } = {}) {
    this.k1 = k1;
    this.b = b;
    this.docs = docs.map(tokenize);
    this.N = this.docs.length;
    this.avgLen = this.docs.reduce((s, d) => s + d.length, 0) / (this.N || 1);
    this.df = new Map();
    for (const doc of this.docs) for (const term of new Set(doc)) this.df.set(term, (this.df.get(term) || 0) + 1);
  }

  idf(term) {
    const n = this.df.get(term) || 0;
    return Math.log(1 + (this.N - n + 0.5) / (n + 0.5));
  }

  // Returns the best k docs: { index, score, coverage }.
  // coverage = share of the query's idf weight that appears in the doc (0..1), a scale-free relevance signal.
  search(query, k = 4) {
    const terms = [...new Set(tokenize(query))];
    if (!terms.length || !this.N) return [];
    // Query words the knowledge base has never seen still count against relevance, but with the weight of a rare known word.
    const maxIdf = Math.log(1 + (this.N - 1 + 0.5) / 1.5);
    const totalIdf = terms.reduce((s, t) => s + (this.df.has(t) ? this.idf(t) : maxIdf), 0) || 1;
    const results = [];
    this.docs.forEach((doc, index) => {
      const freq = new Map();
      for (const t of doc) freq.set(t, (freq.get(t) || 0) + 1);
      let score = 0;
      let matchedIdf = 0;
      for (const t of terms) {
        const f = freq.get(t);
        if (!f) continue;
        const idf = this.idf(t);
        matchedIdf += idf;
        score += idf * ((f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * doc.length) / this.avgLen)));
      }
      if (score > 0) results.push({ index, score, coverage: matchedIdf / totalIdf });
    });
    return results.sort((a, b) => b.score - a.score).slice(0, k);
  }
}
