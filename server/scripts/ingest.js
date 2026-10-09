import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { config } from "../src/config.js";
import { connectDB } from "../src/db.js";
import KnowledgeChunk from "../src/models/KnowledgeChunk.js";
import { createEmbedder } from "../src/rag/embeddings.js";
import { ingestFolder } from "../src/rag/ingest.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "knowledge");
const embedder = createEmbedder({ apiKey: config.geminiApiKey, model: config.embeddingModel, dims: config.embeddingDims });

await connectDB(config.mongoUri);
console.log(embedder ? "Creating embeddings with Gemini..." : "No GEMINI_API_KEY: indexing text only (keyword search will be used).");
const results = await ingestFolder(dir, { KnowledgeChunk, embedder });
results.forEach((r) => console.log(`  ${r.file}: ${r.chunks} chunks${r.embedded ? " (embedded)" : ""}`));
console.log(`Done. ${results.reduce((n, r) => n + r.chunks, 0)} chunks indexed.`);
await mongoose.disconnect();
