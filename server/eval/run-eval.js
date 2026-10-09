// Runs the agent on questions.json and prints accuracy. Needs MongoDB (seeded + ingested) and API keys.
//   npm run eval
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { config } from "../src/config.js";
import { connectDB } from "../src/db.js";
import { buildContainer } from "../src/container.js";
import { runSupportAgent, HANDOFF_MESSAGE } from "../src/agent/supportAgent.js";
import { gradeTurn } from "./grade.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const questions = JSON.parse(await fs.readFile(path.join(here, "questions.json"), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!config.groqApiKey) {
  console.error("GROQ_API_KEY is not set.");
  process.exit(1);
}
await connectDB(config.mongoUri);
const { deps, retriever } = buildContainer();
console.log(`Model: ${config.groqModel} | retrieval: ${deps.retriever.embedder ? "semantic" : "keyword"} | chunks: ${await retriever.size()} | questions: ${questions.length}\n`);

const evalDeps = { ...deps, createTicket: async (data) => ({ number: "TKT-EVAL", _id: null, ...data }) }; // do not write tickets while evaluating
const results = [];

for (const q of questions) {
  const history = [];
  let last;
  try {
    for (const turn of q.turns) {
      last = await runSupportAgent({ history: [...history], userMessage: turn, deps: evalDeps });
      history.push({ role: "user", content: turn }, { role: "assistant", content: last.handoff ? HANDOFF_MESSAGE : last.reply });
      await sleep(600); // stay under free-tier rate limits
    }
    const grade = gradeTurn(q.expect, last);
    results.push({ id: q.id, category: q.category, question: q.turns.at(-1), pass: grade.pass, problems: grade.problems, reply: last.reply, handoff: last.handoff, confidence: last.confidence, relevance: last.retrieval.topRelevance, tools: last.toolsUsed });
  } catch (err) {
    results.push({ id: q.id, category: q.category, question: q.turns.at(-1), pass: false, problems: [`error: ${err.message}`] });
  }
  const r = results.at(-1);
  console.log(`${r.pass ? "PASS" : "FAIL"}  #${r.id} [${r.category}] ${r.question}`);
  if (!r.pass) console.log(`      ${r.problems.join("; ")}${r.reply ? `\n      reply: ${String(r.reply).slice(0, 160)}` : ""}`);
}

const passed = results.filter((r) => r.pass).length;
console.log(`\nOverall: ${passed}/${results.length} correct (${Math.round((passed / results.length) * 100)}%)`);
const byCat = {};
for (const r of results) {
  byCat[r.category] ||= { pass: 0, total: 0 };
  byCat[r.category].total++;
  if (r.pass) byCat[r.category].pass++;
}
for (const [cat, v] of Object.entries(byCat)) console.log(`  ${cat.padEnd(13)} ${v.pass}/${v.total}`);

const rel = (list) => (list.length ? (list.reduce((s, r) => s + r.relevance, 0) / list.length).toFixed(2) : "n/a");
console.log(`\nAvg retrieval relevance: answerable ${rel(results.filter((r) => r.category === "knowledge" && typeof r.relevance === "number"))} | handoff questions ${rel(results.filter((r) => r.category === "handoff" && typeof r.relevance === "number"))}`);
console.log("If handoff questions score close to answerable ones, adjust RELEVANCE_LOW / RELEVANCE_HIGH / CONFIDENCE_THRESHOLD in .env.");

await fs.writeFile(path.join(here, "results.json"), JSON.stringify(results, null, 2));
console.log("Saved eval/results.json");
await mongoose.disconnect();
