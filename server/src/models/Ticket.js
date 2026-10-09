import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true },
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", default: null },
    customerEmail: { type: String, default: null, lowercase: true, trim: true },
    subject: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    priority: { type: String, enum: ["low", "normal", "high", "urgent"], default: "normal" },
    status: { type: String, enum: ["open", "in_progress", "closed"], default: "open" },
    createdBy: { type: String, enum: ["ai_agent", "handoff"], default: "ai_agent" },
  },
  { timestamps: true }
);

export default mongoose.model("Ticket", schema);
