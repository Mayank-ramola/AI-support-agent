// Builds the shared pieces (retriever, LLM client, data access) used by the API server and the eval script.
import { config } from "./config.js";
import KnowledgeChunk from "./models/KnowledgeChunk.js";
import Order from "./models/Order.js";
import Ticket from "./models/Ticket.js";
import { createEmbedder } from "./rag/embeddings.js";
import { Retriever } from "./rag/retriever.js";
import { createLLM } from "./agent/llm.js";

export const loadChunks = async () =>
  (await KnowledgeChunk.find().lean()).map((c) => ({ id: String(c._id), docTitle: c.docTitle, heading: c.heading, text: c.text, embedding: c.embedding }));

export const nextTicketNumber = () => `TKT-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 36).toString(36).toUpperCase()}`;

export function buildContainer() {
  const embedder = createEmbedder({ apiKey: config.geminiApiKey, model: config.embeddingModel, dims: config.embeddingDims });
  const retriever = new Retriever({ loadChunks, embedder, low: config.relevanceLow, high: config.relevanceHigh });
  const llm = createLLM({ apiKey: config.groqApiKey, model: config.groqModel });
  const deps = {
    llm,
    retriever,
    storeName: config.storeName,
    supportEmail: config.supportEmail,
    topK: config.topK,
    confidenceThreshold: config.confidenceThreshold,
    findOrder: (orderNumber) => Order.findOne({ orderNumber }).lean(),
    createTicket: (data) => Ticket.create({ number: nextTicketNumber(), ...data }),
  };
  return { embedder, retriever, llm, deps };
}
