import { formatHits } from "./prompts.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isEmail = (s) => EMAIL.test(String(s || "").trim());

export function normalizeOrderNumber(raw) {
  const m = String(raw || "").match(/(\d{3,8})/);
  return m ? `ORD-${m[1]}` : null;
}

export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "search_knowledge_base",
      description: "Search the store's help articles (shipping, returns, payments, sizing, products, account). Use a short, focused query.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_order",
      description: "Look up an order's status and tracking. Requires the order number AND the email used for the order.",
      parameters: {
        type: "object",
        properties: { order_number: { type: "string", description: "e.g. ORD-1001" }, email: { type: "string" } },
        required: ["order_number", "email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_ticket",
      description: "Open a support ticket for the human team. Requires the customer's email.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Short summary, under 80 characters" },
          description: { type: "string", description: "What happened and what the customer wants" },
          customer_email: { type: "string" },
          priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
        },
        required: ["subject", "description", "customer_email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reply_to_customer",
      description: "Send the final answer to the customer. Call exactly once at the end of every turn.",
      parameters: {
        type: "object",
        properties: {
          answer: { type: "string" },
          answer_type: { type: "string", enum: ["kb_answer", "tool_result", "smalltalk", "out_of_scope", "cannot_answer"] },
          confidence: { type: "number", description: "0 to 1" },
          source_ids: { type: "array", items: { type: "string" }, description: "Passage ids like S1, S2" },
          needs_human: { type: "boolean" },
        },
        required: ["answer", "answer_type", "confidence"],
      },
    },
  },
];

// Registers search hits under short ids (S1, S2, ...) that the model can cite.
export function registerHits(state, hits) {
  const added = [];
  for (const hit of hits) {
    const existing = [...state.sources.entries()].find(([, h]) => h.id === hit.id);
    if (existing) continue;
    state.counter += 1;
    state.sources.set(`S${state.counter}`, hit);
    added.push(hit);
  }
  return added;
}

// Runs one tool call. `state` collects what happened so the agent can judge confidence afterwards.
export async function runTool(name, args, { retriever, topK, findOrder, createTicket }, state) {
  switch (name) {
    case "search_knowledge_base": {
      const query = String(args.query || "").trim();
      if (!query) return "Tool error: query is empty.";
      const result = await retriever.search(query, topK);
      state.topRelevance = Math.max(state.topRelevance, result.topRelevance);
      state.mode = result.mode;
      const start = state.counter + 1;
      const added = registerHits(state, result.hits);
      return added.length ? formatHits(added, start) : "No new passages found.";
    }
    case "lookup_order": {
      const orderNumber = normalizeOrderNumber(args.order_number);
      const email = String(args.email || "").trim().toLowerCase();
      if (!orderNumber || !isEmail(email)) return "Need both a valid order number and the email used for the order. Ask the customer.";
      const order = await findOrder(orderNumber);
      // Same message for "no such order" and "wrong email", so the tool cannot be used to probe for orders.
      if (!order || String(order.email).toLowerCase() !== email) {
        return "No order found for that order number and email. Do not guess. Ask the customer to check both.";
      }
      state.orderVerified = true;
      state.customerEmail = email;
      return JSON.stringify({
        orderNumber: order.orderNumber,
        status: order.status,
        items: (order.items || []).map((i) => ({ name: i.name, qty: i.qty })),
        total: order.total,
        carrier: order.carrier,
        trackingNumber: order.trackingNumber,
        estimatedDelivery: order.estimatedDelivery ? new Date(order.estimatedDelivery).toISOString().slice(0, 10) : null,
        placedAt: order.placedAt ? new Date(order.placedAt).toISOString().slice(0, 10) : null,
      });
    }
    case "create_ticket": {
      const subject = String(args.subject || "").trim().slice(0, 120);
      const email = String(args.customer_email || "").trim().toLowerCase();
      if (!subject) return "Tool error: subject is required.";
      if (!isEmail(email)) return "Tool error: a valid customer email is required. Ask the customer for it.";
      if (state.ticket) return `A ticket was already created this turn: ${state.ticket.number}.`;
      const priority = ["low", "normal", "high", "urgent"].includes(args.priority) ? args.priority : "normal";
      const ticket = await createTicket({
        subject,
        description: String(args.description || "").slice(0, 2000),
        customerEmail: email,
        priority,
      });
      state.ticket = { number: ticket.number };
      state.customerEmail = email;
      return `Ticket ${ticket.number} created.`;
    }
    default:
      return `Unknown tool: ${name}`;
  }
}
