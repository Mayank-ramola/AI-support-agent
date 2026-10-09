import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { rateLimit } from "express-rate-limit";
import Conversation from "../models/Conversation.js";
import Ticket from "../models/Ticket.js";
import Order from "../models/Order.js";
import KnowledgeChunk from "../models/KnowledgeChunk.js";
import { requireAdmin, safeEqual } from "../middleware/adminAuth.js";
import { ingestDocument } from "../rag/ingest.js";

const validId = (id) => mongoose.isValidObjectId(id);

export function adminRouter({ config, retriever, embedder }) {
  const router = express.Router();

  router.post(
    "/login",
    rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { message: "Too many login attempts. Try again later." } }),
    (req, res) => {
      const { email, password } = req.body || {};
      const ok = config.adminEmail && config.adminPassword && safeEqual(email ?? "", config.adminEmail) && safeEqual(password ?? "", config.adminPassword);
      if (!ok) return res.status(401).json({ message: "Email or password is incorrect." });
      res.json({ token: jwt.sign({ role: "admin" }, config.jwtSecret, { expiresIn: "12h" }) });
    }
  );

  router.use(requireAdmin(config.jwtSecret));

  router.get("/stats", async (req, res, next) => {
    try {
      const [conversations, waiting, handedOff, openTickets, conf] = await Promise.all([
        Conversation.countDocuments(),
        Conversation.countDocuments({ status: { $in: ["needs_human", "human"] } }),
        Conversation.countDocuments({ handoffReason: { $ne: null } }),
        Ticket.countDocuments({ status: { $ne: "closed" } }),
        Conversation.aggregate([
          { $unwind: "$messages" },
          { $match: { "messages.role": "assistant", "messages.confidence": { $ne: null } } },
          { $group: { _id: null, avg: { $avg: "$messages.confidence" }, replies: { $sum: 1 } } },
        ]),
      ]);
      res.json({
        conversations,
        waitingForHuman: waiting,
        openTickets,
        assistantReplies: conf[0]?.replies || 0,
        avgConfidence: conf[0] ? Math.round(conf[0].avg * 100) / 100 : null,
        handledByAI: conversations ? Math.round(((conversations - handedOff) / conversations) * 100) : null,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/conversations", async (req, res, next) => {
    try {
      const filter = ["ai", "needs_human", "human", "resolved"].includes(req.query.status) ? { status: req.query.status } : {};
      const list = await Conversation.find(filter).sort({ lastActivity: -1 }).limit(100).populate("ticket", "number status").lean();
      res.json(
        list.map((c) => {
          const last = c.messages[c.messages.length - 1];
          const confs = c.messages.map((m) => m.confidence).filter((x) => typeof x === "number");
          return {
            id: c._id,
            status: c.status,
            customerEmail: c.customerEmail,
            lastActivity: c.lastActivity,
            messageCount: c.messages.length,
            preview: last ? last.content.slice(0, 100) : "",
            lowestConfidence: confs.length ? Math.min(...confs) : null,
            ticket: c.ticket ? { number: c.ticket.number, status: c.ticket.status } : null,
          };
        })
      );
    } catch (err) {
      next(err);
    }
  });

  router.get("/conversations/:id", async (req, res, next) => {
    try {
      if (!validId(req.params.id)) return res.status(404).json({ message: "Conversation not found." });
      const conv = await Conversation.findById(req.params.id).populate("ticket", "number status subject").lean();
      if (!conv) return res.status(404).json({ message: "Conversation not found." });
      res.json(conv);
    } catch (err) {
      next(err);
    }
  });

  router.post("/conversations/:id/reply", async (req, res, next) => {
    try {
      const text = String(req.body?.text || "").trim();
      if (!validId(req.params.id) || !text || text.length > 2000) return res.status(400).json({ message: "Write a reply of up to 2000 characters." });
      const conv = await Conversation.findById(req.params.id);
      if (!conv) return res.status(404).json({ message: "Conversation not found." });
      conv.messages.push({ role: "human", content: text });
      conv.status = "human";
      conv.lastActivity = new Date();
      await conv.save();
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/conversations/:id", async (req, res, next) => {
    try {
      const status = req.body?.status;
      if (!validId(req.params.id) || !["ai", "resolved"].includes(status)) return res.status(400).json({ message: "Status must be resolved or ai." });
      const conv = await Conversation.findByIdAndUpdate(req.params.id, { status }, { new: true });
      if (!conv) return res.status(404).json({ message: "Conversation not found." });
      res.json({ ok: true, status: conv.status });
    } catch (err) {
      next(err);
    }
  });

  router.get("/tickets", async (req, res, next) => {
    try {
      const filter = ["open", "in_progress", "closed"].includes(req.query.status) ? { status: req.query.status } : {};
      res.json(await Ticket.find(filter).sort({ createdAt: -1 }).limit(200).lean());
    } catch (err) {
      next(err);
    }
  });

  router.patch("/tickets/:id", async (req, res, next) => {
    try {
      const status = req.body?.status;
      if (!validId(req.params.id) || !["open", "in_progress", "closed"].includes(status)) return res.status(400).json({ message: "Invalid status." });
      const ticket = await Ticket.findByIdAndUpdate(req.params.id, { status }, { new: true });
      if (!ticket) return res.status(404).json({ message: "Ticket not found." });
      res.json(ticket);
    } catch (err) {
      next(err);
    }
  });

  router.get("/documents", async (req, res, next) => {
    try {
      const docs = await KnowledgeChunk.aggregate([
        {
          $group: {
            _id: "$docId",
            title: { $first: "$docTitle" },
            chunks: { $sum: 1 },
            embedded: { $sum: { $cond: [{ $isArray: "$embedding" }, 1, 0] } },
            updatedAt: { $max: "$updatedAt" },
          },
        },
        { $sort: { title: 1 } },
      ]);
      res.json({ mode: embedder ? "semantic" : "keyword", documents: docs.map((d) => ({ docId: d._id, title: d.title, chunks: d.chunks, embedded: d.embedded, updatedAt: d.updatedAt })) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/documents", async (req, res, next) => {
    try {
      const title = String(req.body?.title || "").trim();
      const text = String(req.body?.text || "").trim();
      if (!title || title.length > 100 || !text || text.length > 20000) {
        return res.status(400).json({ message: "Give the document a title (up to 100 characters) and text (up to 20,000 characters)." });
      }
      const result = await ingestDocument({ title, text }, { KnowledgeChunk, embedder });
      retriever.invalidate();
      res.status(201).json(result);
    } catch (err) {
      if (err.message.startsWith("Embedding")) return res.status(502).json({ message: `Could not create embeddings: ${err.message}` });
      next(err);
    }
  });

  router.delete("/documents/:docId", async (req, res, next) => {
    try {
      const result = await KnowledgeChunk.deleteMany({ docId: String(req.params.docId) });
      retriever.invalidate();
      res.json({ deleted: result.deletedCount });
    } catch (err) {
      next(err);
    }
  });

  router.get("/orders", async (req, res, next) => {
    try {
      res.json(await Order.find().sort({ orderNumber: 1 }).limit(100).lean());
    } catch (err) {
      next(err);
    }
  });

  return router;
}
