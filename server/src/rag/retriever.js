import { BM25 } from "./bm25.js";
import { dot, relevanceFromCosine, clamp01 } from "./similarity.js";

// Finds the knowledge-base chunks most relevant to a question.
// Uses embeddings when available, otherwise (or if the embedding call fails) BM25 keyword search.
export class Retriever {
  constructor({ loadChunks, embedder = null, low = 0.55, high = 0.75, keywordFull = 0.5 }) {
    this.loadChunks = loadChunks;
    this.embedder = embedder;
    this.low = low;
    this.high = high;
    this.keywordFull = keywordFull; // keyword coverage at or above this counts as fully relevant
    this.chunks = null;
    this.bm25 = null;
  }

  invalidate() {
    this.chunks = null;
    this.bm25 = null;
  }

  async ensureLoaded() {
    if (this.chunks) return;
    this.chunks = await this.loadChunks();
    this.bm25 = new BM25(this.chunks.map((c) => c.text));
  }

  async size() {
    await this.ensureLoaded();
    return this.chunks.length;
  }

  // Returns { mode, topRelevance, hits: [{ id, title, heading, text, relevance }] }
  async search(query, k = 4) {
    await this.ensureLoaded();
    if (!this.chunks.length || !query?.trim()) return { mode: "none", topRelevance: 0, hits: [] };

    const canEmbed = this.embedder && this.chunks.every((c) => Array.isArray(c.embedding) && c.embedding.length);
    if (canEmbed) {
      try {
        const [q] = await this.embedder.embed([query], "RETRIEVAL_QUERY");
        const scored = this.chunks
          .map((chunk) => ({ chunk, cos: dot(q, chunk.embedding) }))
          .sort((a, b) => b.cos - a.cos)
          .slice(0, k);
        return this.#result("semantic", scored.map((s) => ({ chunk: s.chunk, relevance: relevanceFromCosine(s.cos, this.low, this.high) })));
      } catch (err) {
        console.warn("Embedding search failed, using keyword search:", err.message);
      }
    }
    const found = this.bm25.search(query, k);
    return this.#result("keyword", found.map((f) => ({ chunk: this.chunks[f.index], relevance: clamp01(f.coverage / this.keywordFull) })));
  }

  #result(mode, items) {
    const hits = items.map(({ chunk, relevance }) => ({
      id: String(chunk.id),
      title: chunk.docTitle,
      heading: chunk.heading,
      text: chunk.text,
      relevance: Math.round(relevance * 100) / 100,
    }));
    return { mode, topRelevance: hits.length ? Math.max(...hits.map((h) => h.relevance)) : 0, hits };
  }
}
