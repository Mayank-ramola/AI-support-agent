import express from "express";
import { rateLimit } from "express-rate-limit";
import Conversation from "../models/Conversation.js";
import Ticket from "../models/Ticket.js";
import { runSupportAgent, HANDOFF_MESSAGE } from "../agent/supportAgent.js";
import { isEmail } from "../agent/tools.js";

const SESSION_ID = /^[A-Za-z0-9_-]{16,64}$/;

const transcript = (messages) =>
  messages.map((m) => `${m.role === "user" ? "Customer" : m.role === "human" ? "Agent" : "Assistant"}: ${m.content}`).join("\n");

export function chatRouter(deps) {
  const router = express.Router();
  const limiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { message: "Too many messages. Please wait a minute." } });

  router.post("/", limiter, async (req, res, next) => {
    try {
      const { sessionId, message } = req.body || {};
      if (!SESSION_ID.test(String(sessionId || ""))) return res.status(400).json({ message: "Invalid session." });
      const text = String(message || "").trim();
      if (!text || text.length > 1000) return res.status(400).json({ message: "Messages must be 1 to 1000 characters." });

      const conv = (await Conversation.findOne({ sessionId })) || new Conversation({ sessionId });
      if (conv.status === "resolved") conv.status = "ai"; // a new message reopens a resolved chat
      const history = conv.messages.map((m) => ({ role: m.role, content: m.content }));
      conv.messages.push({ role: "user", content: text });
      conv.lastActivity = new Date();

      // A person is handling this chat: save the message, do not let the AI answer.
      if (conv.status === "needs_human" || conv.status === "human") {
        await conv.save();
        return res.json({ status: conv.status, reply: null, waiting: true });
      }
      if (!deps.llm) return res.status(503).json({ message: "The assistant is not set up yet." });

      let createdTicket = null;
      let result;
      try {
        result = await runSupportAgent({
          history,
          userMessage: text,
          deps: {
            ...deps,
            createTicket: async (data) => {
              createdTicket = await deps.createTicket({ ...data, conversation: conv._id, createdBy: "ai_agent" });
              return createdTicket;
            },
          },
        });
      } catch (err) {
        console.error("Agent error:", err.message);
        return res.status(502).json({ message: "I couldn't reach the assistant just now. Please try again in a moment." });
      }

      if (result.customerEmail && !conv.customerEmail) conv.customerEmail = result.customerEmail;
      if (createdTicket) conv.ticket = createdTicket._id;
      let ticketNumber = createdTicket?.number || null;
      let replyText = result.reply;

      if (result.handoff) {
        if (!conv.ticket) {
          const ticket = await deps.createTicket({
            subject: `Needs human: ${text.slice(0, 60)}`,
            description: transcript(conv.messages.slice(-6)),
            customerEmail: conv.customerEmail,
            priority: "normal",
            conversation: conv._id,
            createdBy: "handoff",
          });
          conv.ticket = ticket._id;
          ticketNumber = ticket.number;
        } else if (!ticketNumber) {
          ticketNumber = (await Ticket.findById(conv.ticket))?.number || null;
        }
        conv.status = "needs_human";
        conv.handoffReason = result.handoffReason;
        replyText = HANDOFF_MESSAGE + (ticketNumber ? ` Your ticket number is ${ticketNumber}.` : "");
      }

      conv.messages.push({
        role: "assistant",
        content: replyText,
        confidence: result.confidence,
        sources: result.sources,
        toolsUsed: result.toolsUsed,
        draft: result.handoff ? result.draft : null,
      });
      await conv.save();

      res.json({
        reply: replyText,
        status: conv.status,
        sources: result.sources.map((s) => ({ title: s.title, heading: s.heading })),
        ticket: ticketNumber,
        needsEmail: result.handoff && !conv.customerEmail,
      });
    } catch (err) {
      next(err);
    }
  });

  // The widget polls this to show replies from a human agent.
  router.get("/:sessionId", async (req, res, next) => {
    try {
      if (!SESSION_ID.test(req.params.sessionId)) return res.status(400).json({ message: "Invalid session." });
      const conv = await Conversation.findOne({ sessionId: req.params.sessionId }).lean();
      if (!conv) return res.json({ status: "ai", messages: [] });
      res.json({
        status: conv.status,
        messages: conv.messages.map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:sessionId/email", async (req, res, next) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      if (!SESSION_ID.test(req.params.sessionId) || !isEmail(email)) return res.status(400).json({ message: "Enter a valid email address." });
      const conv = await Conversation.findOne({ sessionId: req.params.sessionId });
      if (!conv) return res.status(404).json({ message: "Conversation not found." });
      conv.customerEmail = email;
      await conv.save();
      if (conv.ticket) await Ticket.updateOne({ _id: conv.ticket }, { customerEmail: email });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
