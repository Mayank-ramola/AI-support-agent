import { normalize } from "./similarity.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Google Gemini embeddings over REST. Returns null when there is no API key (callers fall back to BM25).
export function createEmbedder({ apiKey, model, dims, fetchImpl = fetch, concurrency = 4, retryDelayMs = 1000 }) {
  if (!apiKey) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`;

  async function embedOne(text, taskType) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: dims,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const values = data?.embedding?.values;
        if (!Array.isArray(values)) throw new Error("Embedding response had no values");
        return normalize(values); // vectors cut to fewer dimensions are not unit length, so normalise
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await sleep(retryDelayMs * 2 ** attempt);
        continue;
      }
      throw new Error(`Embedding request failed (${res.status})`);
    }
  }

  return {
    // taskType: "RETRIEVAL_DOCUMENT" when indexing, "RETRIEVAL_QUERY" when searching
    async embed(texts, taskType = "RETRIEVAL_DOCUMENT") {
      const out = new Array(texts.length);
      let next = 0;
      const worker = async () => {
        while (next < texts.length) {
          const i = next++;
          out[i] = await embedOne(texts[i], taskType);
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, texts.length) }, worker));
      return out;
    },
  };
}
