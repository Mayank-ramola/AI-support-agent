import test from "node:test";
import assert from "node:assert/strict";
import { combineConfidence, shouldHandoff } from "../src/agent/confidence.js";
import { runTool, normalizeOrderNumber, isEmail } from "../src/agent/tools.js";
import { runSupportAgent } from "../src/agent/supportAgent.js";
import { gradeTurn } from "../eval/grade.js";

// ---------- confidence ----------
test("kb answers are capped by retrieval relevance", () => {
  assert.equal(combineConfidence({ modelConfidence: 0.95, answerType: "kb_answer", topRelevance: 0.4, citedSources: 1 }), 0.4);
  assert.equal(combineConfidence({ modelConfidence: 0.8, answerType: "kb_answer", topRelevance: 1, citedSources: 1 }), 0.8);
});
test("a kb answer with no cited source is not trusted", () => {
  assert.ok(combineConfidence({ modelConfidence: 0.95, answerType: "kb_answer", topRelevance: 1, citedSources: 0 }) <= 0.3);
});
test("tool results need a successful tool call", () => {
  assert.equal(combineConfidence({ modelConfidence: 0.9, answerType: "tool_result", toolGrounded: true }), 0.9);
  assert.equal(combineConfidence({ modelConfidence: 0.9, answerType: "tool_result", toolGrounded: false, topRelevance: 0.2, citedSources: 1 }), 0.2);
});
test("smalltalk ignores retrieval; cannot_answer is always low", () => {
  assert.equal(combineConfidence({ modelConfidence: 0.9, answerType: "smalltalk", topRelevance: 0 }), 0.9);
  assert.ok(combineConfidence({ modelConfidence: 0.99, answerType: "cannot_answer", topRelevance: 1 }) <= 0.2);
});
test("handoff rules", () => {
  assert.equal(shouldHandoff({ confidence: 0.9, answerType: "kb_answer", needsHuman: true, threshold: 0.6 }).handoff, true);
  assert.equal(shouldHandoff({ confidence: 0.9, answerType: "cannot_answer", needsHuman: false, threshold: 0.6 }).reason, "no_answer_found");
  assert.equal(shouldHandoff({ confidence: 0.5, answerType: "kb_answer", needsHuman: false, threshold: 0.6 }).reason, "low_confidence");
  assert.equal(shouldHandoff({ confidence: 0.6, answerType: "kb_answer", needsHuman: false, threshold: 0.6 }).handoff, false);
});

// ---------- tools ----------
test("order number and email parsing", () => {
  assert.equal(normalizeOrderNumber("#ord-1001"), "ORD-1001");
  assert.equal(normalizeOrderNumber("1003"), "ORD-1003");
  assert.equal(normalizeOrderNumber("hello"), null);
  assert.ok(isEmail("a@b.co") && !isEmail("a@b") && !isEmail(""));
});

const order = { orderNumber: "ORD-1001", email: "alex@example.com", status: "shipped", items: [{ name: "Socks", qty: 2 }], total: 59.98, carrier: "SwiftShip", trackingNumber: "SS1" };
const newState = () => ({ sources: new Map(), counter: 0, toolsUsed: [], orderVerified: false, ticket: null, customerEmail: null, topRelevance: 0, mode: "none" });
const toolDeps = (extra = {}) => ({
  retriever: { search: async () => ({ mode: "keyword", topRelevance: 0.8, hits: [{ id: "c1", title: "T", heading: "T > H", text: "T > H\nbody", relevance: 0.8 }] }) },
  topK: 4,
  findOrder: async (n) => (n === "ORD-1001" ? order : null),
  createTicket: async (d) => ({ number: "TKT-1", ...d }),
  ...extra,
});

test("lookup_order returns data only when order number and email both match", async () => {
  const s1 = newState();
  const ok = await runTool("lookup_order", { order_number: "ord-1001", email: "ALEX@example.com" }, toolDeps(), s1);
  assert.equal(JSON.parse(ok).status, "shipped");
  assert.equal(JSON.parse(ok).email, undefined); // email is never echoed back
  assert.equal(s1.orderVerified, true);

  const s2 = newState();
  const wrongEmail = await runTool("lookup_order", { order_number: "ORD-1001", email: "other@example.com" }, toolDeps(), s2);
  const noOrder = await runTool("lookup_order", { order_number: "ORD-9999", email: "alex@example.com" }, toolDeps(), s2);
  assert.equal(wrongEmail, noOrder); // same message, so it cannot be used to probe for orders
  assert.ok(!wrongEmail.includes("shipped"));
  assert.equal(s2.orderVerified, false);
});

test("create_ticket validates input and creates only one ticket per turn", async () => {
  const s = newState();
  assert.match(await runTool("create_ticket", { subject: "Damaged", description: "x", customer_email: "bad" }, toolDeps(), s), /valid customer email/);
  assert.equal(s.ticket, null);
  assert.match(await runTool("create_ticket", { subject: "Damaged", description: "x", customer_email: "a@b.com", priority: "urgent" }, toolDeps(), s), /TKT-1/);
  assert.match(await runTool("create_ticket", { subject: "Again", description: "x", customer_email: "a@b.com" }, toolDeps(), s), /already created/);
});

test("search_knowledge_base registers new passages under fresh ids", async () => {
  const s = newState();
  const out = await runTool("search_knowledge_base", { query: "returns" }, toolDeps(), s);
  assert.match(out, /\[S1\]/);
  assert.ok(s.sources.has("S1"));
  assert.equal(await runTool("search_knowledge_base", { query: "returns" }, toolDeps(), s), "No new passages found.");
});

// ---------- agent loop with a scripted LLM ----------
const scriptedLLM = (steps) => {
  const queue = [...steps];
  const seen = [];
  // snapshot the request: the agent keeps appending to its messages array after the call
  return { seen, chat: async (req) => { seen.push({ ...req, messages: req.messages.map((m) => ({ ...m })) }); return queue.shift(); } };
};
const call = (name, args, id = name) => ({ content: "", toolCalls: [{ id, name, args }] });
const reply = (args) => call("reply_to_customer", args);

const hit = (relevance = 0.9) => ({ id: "c1", title: "Returns", heading: "Returns > Window", text: "Returns > Window\nItems can be returned within 30 days.", relevance });
const agentDeps = (llm, { relevance = 0.9, hits } = {}) => ({
  llm,
  retriever: { search: async () => ({ mode: "semantic", topRelevance: relevance, hits: hits ?? [hit(relevance)] }) },
  storeName: "Hannes & Co.",
  supportEmail: "support@example.com",
  topK: 4,
  confidenceThreshold: 0.6,
  findOrder: async (n) => (n === "ORD-1001" ? order : null),
  createTicket: async (d) => ({ number: "TKT-9", ...d }),
  now: () => new Date("2026-10-09T00:00:00Z"),
});

test("answers from the knowledge base with a cited source", async () => {
  const llm = scriptedLLM([reply({ answer: "You can return items within 30 days.", answer_type: "kb_answer", confidence: 0.92, source_ids: ["S1"] })]);
  const r = await runSupportAgent({ userMessage: "Can I return a shirt?", deps: agentDeps(llm) });
  assert.equal(r.handoff, false);
  assert.match(r.reply, /30 days/);
  assert.equal(r.sources[0].title, "Returns");
  assert.equal(r.confidence, 0.9); // capped by relevance 0.9
  assert.match(llm.seen[0].messages[0].content, /\[S1\] Returns > Window/); // retrieved context is in the system prompt
});

test("low retrieval relevance causes a handoff and withholds the draft answer", async () => {
  const llm = scriptedLLM([reply({ answer: "Probably yes.", answer_type: "kb_answer", confidence: 0.95, source_ids: ["S1"] })]);
  const r = await runSupportAgent({ userMessage: "Do you do embroidery?", deps: agentDeps(llm, { relevance: 0.2 }) });
  assert.equal(r.handoff, true);
  assert.equal(r.handoffReason, "low_confidence");
  assert.equal(r.reply, null);
  assert.equal(r.draft, "Probably yes.");
});

test("cannot_answer and needs_human both hand off", async () => {
  const a = await runSupportAgent({ userMessage: "x", deps: agentDeps(scriptedLLM([reply({ answer: "I don't know", answer_type: "cannot_answer", confidence: 0.9 })])) });
  assert.equal(a.handoff, true);
  const b = await runSupportAgent({ userMessage: "get me a person", deps: agentDeps(scriptedLLM([reply({ answer: "Sure.", answer_type: "smalltalk", confidence: 0.9, needs_human: true })])) });
  assert.equal(b.handoffReason, "agent_requested_human");
});

test("smalltalk does not need retrieval", async () => {
  const r = await runSupportAgent({ userMessage: "hi", deps: agentDeps(scriptedLLM([reply({ answer: "Hello! How can I help?", answer_type: "smalltalk", confidence: 0.95 })]), { relevance: 0, hits: [] }) });
  assert.equal(r.handoff, false);
  assert.equal(r.reply, "Hello! How can I help?");
});

test("order flow: tool call, tool result goes back to the model, answer is trusted", async () => {
  const llm = scriptedLLM([
    call("lookup_order", { order_number: "ORD-1001", email: "alex@example.com" }, "t1"),
    reply({ answer: "Your order shipped with SwiftShip, tracking SS1.", answer_type: "tool_result", confidence: 0.95 }),
  ]);
  const r = await runSupportAgent({ userMessage: "Where is ORD-1001? alex@example.com", deps: agentDeps(llm, { relevance: 0.1, hits: [] }) });
  assert.deepEqual(r.toolsUsed, ["lookup_order"]);
  assert.equal(r.handoff, false);
  assert.equal(r.customerEmail, "alex@example.com");
  const toolMsg = llm.seen[1].messages.find((m) => m.role === "tool");
  assert.match(toolMsg.content, /shipped/);
});

test("a wrong email never reveals the order, even if the model claims a tool result", async () => {
  const llm = scriptedLLM([
    call("lookup_order", { order_number: "ORD-1001", email: "wrong@example.com" }, "t1"),
    reply({ answer: "Your order shipped.", answer_type: "tool_result", confidence: 0.95 }),
  ]);
  const r = await runSupportAgent({ userMessage: "ORD-1001 wrong@example.com", deps: agentDeps(llm, { relevance: 0.1, hits: [] }) });
  assert.match(llm.seen[1].messages.find((m) => m.role === "tool").content, /No order found/);
  assert.equal(r.handoff, true); // not grounded, so confidence is low and it goes to a person
});

test("ticket creation through a tool call", async () => {
  const llm = scriptedLLM([
    call("create_ticket", { subject: "Damaged hoodie", description: "Arrived torn", customer_email: "alex@example.com", priority: "high" }, "t1"),
    reply({ answer: "I've opened ticket TKT-9.", answer_type: "tool_result", confidence: 0.9 }),
  ]);
  const r = await runSupportAgent({ userMessage: "damaged, open a ticket, alex@example.com", deps: agentDeps(llm) });
  assert.equal(r.ticket.number, "TKT-9");
  assert.equal(r.handoff, false);
});

test("plain text answer (no reply tool) is accepted but still gated by retrieval", async () => {
  const good = await runSupportAgent({ userMessage: "returns?", deps: agentDeps(scriptedLLM([{ content: "Within 30 days.", toolCalls: [] }]), { relevance: 0.9 }) });
  assert.equal(good.handoff, false);
  const bad = await runSupportAgent({ userMessage: "returns?", deps: agentDeps(scriptedLLM([{ content: "Within 30 days.", toolCalls: [] }]), { relevance: 0.2 }) });
  assert.equal(bad.handoff, true);
});

test("gives up after the iteration limit instead of looping", async () => {
  const llm = scriptedLLM(Array.from({ length: 10 }, (_, i) => call("search_knowledge_base", { query: `q${i}` }, `t${i}`)));
  const r = await runSupportAgent({ userMessage: "loop", deps: agentDeps(llm) });
  assert.equal(r.handoff, true);
  assert.equal(r.handoffReason, "iteration_limit");
  assert.ok(llm.seen.length <= 6);
});

test("history is passed to the model with human replies mapped to assistant", async () => {
  const llm = scriptedLLM([reply({ answer: "ok", answer_type: "smalltalk", confidence: 0.9 })]);
  await runSupportAgent({
    history: [{ role: "user", content: "hi" }, { role: "human", content: "Hello from staff" }],
    userMessage: "thanks",
    deps: agentDeps(llm),
  });
  const roles = llm.seen[0].messages.map((m) => m.role);
  assert.deepEqual(roles, ["system", "user", "assistant", "user"]);
});

// ---------- eval grader ----------
test("grader checks handoff, text and tools", () => {
  const result = { handoff: false, reply: "Standard shipping takes 3 to 7 business days", draft: null, toolsUsed: [] };
  assert.equal(gradeTurn({ anyText: ["3 to 7"] }, result).pass, true);
  assert.equal(gradeTurn({ anyText: ["$75"] }, result).pass, false);
  assert.equal(gradeTurn({ handoff: true }, result).pass, false);
  assert.equal(gradeTurn({ noText: ["business"] }, result).pass, false);
  assert.equal(gradeTurn({ tool: "lookup_order" }, result).pass, false);
});
