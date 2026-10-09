import { clamp01 } from "../rag/similarity.js";

export const ANSWER_TYPES = ["kb_answer", "tool_result", "smalltalk", "out_of_scope", "cannot_answer"];

const round2 = (x) => Math.round(x * 100) / 100;

// Combines what the model says about itself with how well the answer is grounded.
//  - kb_answer: capped by how relevant the retrieved passages were
//  - tool_result: trusted only if a tool call actually succeeded this turn
//  - smalltalk / out_of_scope: no grounding needed
//  - cannot_answer: always low
export function combineConfidence({ modelConfidence, answerType, topRelevance = 0, toolGrounded = false, citedSources = 0 }) {
  const model = clamp01(Number.isFinite(modelConfidence) ? modelConfidence : 0.5);
  if (answerType === "cannot_answer") return round2(Math.min(model, 0.2));
  if (answerType === "smalltalk" || answerType === "out_of_scope") return round2(model);
  if (answerType === "tool_result" && toolGrounded) return round2(model);
  let confidence = Math.min(model, clamp01(topRelevance));
  if (citedSources === 0) confidence = Math.min(confidence, 0.3); // a knowledge answer with no cited source is not grounded
  return round2(confidence);
}

export function shouldHandoff({ confidence, answerType, needsHuman, threshold }) {
  if (needsHuman) return { handoff: true, reason: "agent_requested_human" };
  if (answerType === "cannot_answer") return { handoff: true, reason: "no_answer_found" };
  if (confidence < threshold) return { handoff: true, reason: "low_confidence" };
  return { handoff: false, reason: null };
}
