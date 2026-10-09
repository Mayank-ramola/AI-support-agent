import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    docId: { type: String, required: true, index: true },
    docTitle: { type: String, required: true },
    heading: { type: String, default: "" },
    text: { type: String, required: true },
    index: { type: Number, default: 0 },
    embedding: { type: [Number], default: undefined }, // unit-length vector; absent when no embedding key is set
  },
  { timestamps: true }
);

export default mongoose.model("KnowledgeChunk", schema);
