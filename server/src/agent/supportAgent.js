import { buildSystemPrompt, formatHits } from "./prompts.js";
import { TOOL_DEFINITIONS, registerHits, runTool } from "./tools.js";
import { ANSWER_TYPES, combineConfidence, shouldHandoff } from "./confidence.js";

const MAX_ITERATIONS = 6;
const HISTORY_LIMIT = 8;

export const HANDOFF_MESSAGE =
  "I want to be sure you get the right answer, so I've passed this to our support team. A person will reply here or by email.";

const toLLMRole = (role) => (role === "user" ? "user" : "assistant");

// Short follow-ups like "and for socks?" need the previous question to retrieve well.
function buildQuery(history, userMessage) {
  const previousUser = [...history].reverse().find((m) => m.role === "user");
  return userMessage.split(/\s+/).length < 6 && previousUser ? `${previousUser.content}\n${userMessage}` : userMessage;
}

// Runs one customer turn: retrieve, let the model call tools, end with reply_to_customer, score confidence.
// deps: { llm, retriever, findOrder, createTicket, storeName, supportEmail, topK, confidenceThreshold, now? }
export async function runSupportAgent({ history = [], userMessage, deps }) {
  const { llm, retriever, storeName, supportEmail, topK = 4, confidenceThreshold = 0.6 } = deps;
  const state = { sources: new Map(), counter: 0, toolsUsed: [], orderVerified: false, ticket: null, customerEmail: null, topRelevance: 0, mode: "none" };

  const first = await retriever.search(buildQuery(history, userMessage), topK);
  state.topRelevance = first.topRelevance;
  state.mode = first.mode;
  registerHits(state, first.hits);

  const today = (deps.now ? deps.now() : new Date()).toISOString().slice(0, 10);
  const contextBlock = first.hits.length ? formatHits(first.hits) : "No relevant knowledge-base passages were found for this message.";
  const messages = [
    { role: "system", content: buildSystemPrompt({ storeName, supportEmail, today, contextBlock }) },
    ...history.slice(-HISTORY_LIMIT).map((m) => ({ role: toLLMRole(m.role), content: String(m.content).slice(0, 1000) })),
    { role: "user", content: userMessage },
  ];

  const finish = ({ answer, answerType, modelConfidence, sourceIds = [], needsHuman = false }) => {
    const type = ANSWER_TYPES.includes(answerType) ? answerType : "kb_answer";
    const sources = [...new Set(sourceIds.map(String))]
      .map((id) => state.sources.get(id.toUpperCase()))
      .filter(Boolean)
      .map((h) => ({ id: h.id, title: h.title, heading: h.heading }));
    const toolGrounded = state.orderVerified || Boolean(state.ticket);
    const confidence = combineConfidence({ modelConfidence, answerType: type, topRelevance: state.topRelevance, toolGrounded, citedSources: sources.length });
    const decision = shouldHandoff({ confidence, answerType: type, needsHuman, threshold: confidenceThreshold });
    return {
      reply: decision.handoff ? null : String(answer || "").trim(),
      draft: String(answer || "").trim() || null,
      answerType: type,
      confidence,
      sources: type === "kb_answer" ? sources : [],
      toolsUsed: state.toolsUsed,
      handoff: decision.handoff,
      handoffReason: decision.reason,
      ticket: state.ticket,
      customerEmail: state.customerEmail,
      retrieval: { mode: state.mode, topRelevance: state.topRelevance },
    };
  };

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await llm.chat({ messages, tools: TOOL_DEFINITIONS });

    if (!res.toolCalls.length) {
      // The model answered in plain text instead of using reply_to_customer: trust retrieval only.
      return finish({ answer: res.content, answerType: "kb_answer", modelConfidence: 0.7, sourceIds: [...state.sources.keys()].slice(0, 1) });
    }

    messages.push({
      role: "assistant",
      content: res.content || null,
      tool_calls: res.toolCalls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.args) } })),
    });

    let reply = null;
    for (const call of res.toolCalls) {
      if (call.name === "reply_to_customer") {
        reply = call.args;
        continue;
      }
      let result;
      try {
        result = await runTool(call.name, call.args, deps, state);
      } catch (err) {
        result = `Tool error: ${err.message}`;
      }
      state.toolsUsed.push(call.name);
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }

    if (reply) {
      return finish({
        answer: reply.answer,
        answerType: reply.answer_type,
        modelConfidence: Number(reply.confidence),
        sourceIds: Array.isArray(reply.source_ids) ? reply.source_ids : [],
        needsHuman: reply.needs_human === true,
      });
    }
  }

  // The model never finished: hand off rather than guess.
  return { ...finish({ answer: "", answerType: "cannot_answer", modelConfidence: 0 }), handoffReason: "iteration_limit" };
}
