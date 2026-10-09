import test from "node:test";
import assert from "node:assert/strict";
import { chunkDocument } from "../src/rag/chunker.js";
import { BM25, tokenize } from "../src/rag/bm25.js";
import { cosine, normalize, relevanceFromCosine } from "../src/rag/similarity.js";
import { createEmbedder } from "../src/rag/embeddings.js";
import { Retriever } from "../src/rag/retriever.js";

const DOC = `# Returns

## Return window
You can return most items within 30 days of delivery.

## Refunds
Refunds go back to the original payment method within 2 business days.

${"Long paragraph about shipping boxes and labels. ".repeat(40)}

${"Another long paragraph about carriers and tracking. ".repeat(40)}`;

test("chunker keeps headings and splits long sections", () => {
  const chunks = chunkDocument("Returns", DOC, { maxWords: 140 });
  assert.ok(chunks.length >= 3);
  assert.ok(chunks[0].text.startsWith("Returns > Return window"));
  assert.ok(chunks.every((c) => c.text.length > 0));
  assert.deepEqual(chunks.map((c) => c.index), chunks.map((_, i) => i));
});

test("tokenizer drops stopwords and stems", () => {
  assert.deepEqual(tokenize("How are refunds processed?"), ["refund", "process"]);
});

test("BM25 ranks the relevant chunk first and reports coverage", () => {
  const docs = ["Standard shipping takes 3 to 7 business days", "Refunds are issued to the original payment method", "We accept PayPal and Visa"];
  const bm = new BM25(docs);
  const [top] = bm.search("how long does shipping take", 3);
  assert.equal(top.index, 0);
  assert.ok(top.coverage >= 0.5);
  const unrelated = bm.search("embroidered logo shipping", 3)[0];
  assert.ok(unrelated.coverage < top.coverage); // words the KB has never seen lower the relevance
  assert.equal(bm.search("quantum physics", 3).length, 0);
});

test("cosine and normalisation", () => {
  assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(cosine([1, 0], [0, 1])) < 1e-9);
  const v = normalize([3, 4]);
  assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-9);
});

test("relevanceFromCosine maps anchors to 0..1", () => {
  assert.equal(relevanceFromCosine(0.5, 0.55, 0.75), 0);
  assert.equal(relevanceFromCosine(0.8, 0.55, 0.75), 1);
  assert.ok(Math.abs(relevanceFromCosine(0.65, 0.55, 0.75) - 0.5) < 1e-9);
});

test("embedder normalises vectors, sends the right request and retries on 429", async () => {
  const calls = [];
  let n = 0;
  const fetchImpl = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body), headers: opts.headers });
    if (n++ === 0) return { ok: false, status: 429 };
    return { ok: true, json: async () => ({ embedding: { values: [3, 4] } }) };
  };
  const embedder = createEmbedder({ apiKey: "k", model: "gemini-embedding-001", dims: 2, fetchImpl, retryDelayMs: 1 });
  const [vec] = await embedder.embed(["hello"], "RETRIEVAL_QUERY");
  assert.ok(Math.abs(Math.hypot(...vec) - 1) < 1e-9);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.taskType, "RETRIEVAL_QUERY");
  assert.equal(calls[0].body.outputDimensionality, 2);
  assert.equal(calls[0].headers["x-goog-api-key"], "k");
  assert.equal(createEmbedder({ apiKey: "", model: "m", dims: 2 }), null);
});

const chunks = [
  { id: "a", docTitle: "Shipping", heading: "Shipping > Times", text: "Standard shipping takes 3 to 7 business days", embedding: normalize([1, 0]) },
  { id: "b", docTitle: "Returns", heading: "Returns > Window", text: "Returns are accepted within 30 days", embedding: normalize([0, 1]) },
];

test("retriever uses embeddings when available and maps relevance", async () => {
  const embedder = { embed: async () => [normalize([0.1, 1])] };
  const r = new Retriever({ loadChunks: async () => chunks, embedder, low: 0.5, high: 0.9 });
  const res = await r.search("return policy", 2);
  assert.equal(res.mode, "semantic");
  assert.equal(res.hits[0].id, "b");
  assert.ok(res.topRelevance > 0.9);
});

test("retriever falls back to keyword search when embedding fails or no embedder", async () => {
  const failing = { embed: async () => { throw new Error("boom"); } };
  const r1 = new Retriever({ loadChunks: async () => chunks, embedder: failing });
  const res1 = await r1.search("how long does shipping take", 2);
  assert.equal(res1.mode, "keyword");
  assert.equal(res1.hits[0].id, "a");
  assert.ok(res1.topRelevance > 0 && res1.topRelevance <= 1);

  const r2 = new Retriever({ loadChunks: async () => chunks, embedder: null });
  assert.equal((await r2.search("shipping", 1)).mode, "keyword");
});

test("retriever returns nothing for an empty knowledge base and reloads after invalidate", async () => {
  let data = [];
  const r = new Retriever({ loadChunks: async () => data });
  assert.deepEqual(await r.search("anything"), { mode: "none", topRelevance: 0, hits: [] });
  data = chunks;
  r.invalidate();
  assert.equal(await r.size(), 2);
});
