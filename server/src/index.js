import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rateLimit } from "express-rate-limit";
import { config } from "./config.js";
import { connectDB } from "./db.js";
import { buildContainer } from "./container.js";
import { chatRouter } from "./routes/chat.js";
import { adminRouter } from "./routes/admin.js";

const missing = ["jwtSecret", "adminEmail", "adminPassword", "mongoUri"].filter((k) => !config[k]);
if (missing.length) {
  console.error(`Missing settings: ${missing.join(", ")}. Copy .env.example to .env and fill it in.`);
  process.exit(1);
}

const { embedder, retriever, llm, deps } = buildContainer();

const app = express();
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(express.json({ limit: "100kb" }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false }));

// The chat widget is embedded on other sites, so chat routes accept any origin. Admin routes only accept the dashboard.
app.use("/api/chat", cors(), chatRouter(deps));
app.use("/api/admin", cors({ origin: config.dashboardOrigins }), adminRouter({ config, retriever, embedder }));
app.get("/api/health", (req, res) => res.json({ ok: true, llm: Boolean(llm), retrieval: embedder ? "semantic" : "keyword" }));

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
app.use(express.static(publicDir, { maxAge: "5m" }));

app.use((req, res) => res.status(404).json({ message: "Not found." }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Something went wrong on the server." });
});

connectDB(config.mongoUri)
  .then(async () => {
    app.listen(config.port, () => console.log(`API running on port ${config.port}`));
    if (!llm) console.warn("GROQ_API_KEY is not set: the chat endpoint will return 503.");
    if (!embedder) console.warn("GEMINI_API_KEY is not set: using keyword search instead of embeddings.");
    const chunks = await retriever.size();
    if (!chunks) console.warn("The knowledge base is empty. Run: npm run ingest");
  })
  .catch((err) => {
    console.error("Failed to start:", err.message);
    process.exit(1);
  });
