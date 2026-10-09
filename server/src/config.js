import "dotenv/config";

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && value !== undefined && value !== "" ? n : fallback;
};

export const config = {
  port: num(process.env.PORT, 5000),
  mongoUri: process.env.MONGODB_URI || "",
  jwtSecret: process.env.JWT_SECRET || "",
  adminEmail: process.env.ADMIN_EMAIL || "",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  dashboardOrigins: (process.env.DASHBOARD_ORIGIN || "http://localhost:5173").split(",").map((s) => s.trim()),
  groqApiKey: process.env.GROQ_API_KEY || "",
  groqModel: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  embeddingModel: process.env.EMBEDDING_MODEL || "gemini-embedding-001",
  embeddingDims: 768,
  storeName: process.env.STORE_NAME || "Hannes & Co.",
  supportEmail: process.env.SUPPORT_EMAIL || "support@hannes-demo.example",
  confidenceThreshold: num(process.env.CONFIDENCE_THRESHOLD, 0.6),
  relevanceLow: num(process.env.RELEVANCE_LOW, 0.55),
  relevanceHigh: num(process.env.RELEVANCE_HIGH, 0.75),
  topK: num(process.env.TOP_K, 4),
};
