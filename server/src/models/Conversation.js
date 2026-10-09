import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant", "human"], required: true },
    content: { type: String, required: true },
    confidence: { type: Number, default: null },
    sources: [{ _id: false, id: String, title: String, heading: String }],
    toolsUsed: [String],
    draft: { type: String, default: null }, // AI answer that was withheld because confidence was low
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    status: { type: String, enum: ["ai", "needs_human", "human", "resolved"], default: "ai", index: true },
    customerEmail: { type: String, default: null, lowercase: true, trim: true },
    messages: [messageSchema],
    ticket: { type: mongoose.Schema.Types.ObjectId, ref: "Ticket", default: null },
    handoffReason: { type: String, default: null },
    lastActivity: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

export default mongoose.model("Conversation", schema);
