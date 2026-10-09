import fs from "node:fs/promises";
import path from "node:path";
import { chunkDocument } from "./chunker.js";

export const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Chunks a document, embeds the chunks (if an embedder exists) and replaces any earlier version.
export async function ingestDocument({ title, text }, { KnowledgeChunk, embedder }) {
  const docId = slugify(title);
  const chunks = chunkDocument(title, text);
  if (!chunks.length) throw new Error("The document has no text to index.");

  const vectors = embedder ? await embedder.embed(chunks.map((c) => c.text), "RETRIEVAL_DOCUMENT") : null;
  await KnowledgeChunk.deleteMany({ docId });
  await KnowledgeChunk.insertMany(
    chunks.map((c, i) => ({
      docId,
      docTitle: title,
      heading: c.heading,
      text: c.text,
      index: c.index,
      ...(vectors ? { embedding: vectors[i] } : {}),
    }))
  );
  return { docId, chunks: chunks.length, embedded: Boolean(vectors) };
}

export async function ingestFolder(dir, deps) {
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  const results = [];
  for (const file of files) {
    const text = await fs.readFile(path.join(dir, file), "utf8");
    const title = (text.match(/^#\s+(.+)$/m)?.[1] || file.replace(/\.md$/, "")).trim();
    results.push({ file, ...(await ingestDocument({ title, text }, deps)) });
  }
  return results;
}
