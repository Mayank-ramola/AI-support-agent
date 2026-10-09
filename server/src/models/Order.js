import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    items: [{ name: String, qty: Number, price: Number }],
    total: { type: Number, required: true },
    status: { type: String, enum: ["processing", "shipped", "delivered", "cancelled"], default: "processing" },
    carrier: { type: String, default: null },
    trackingNumber: { type: String, default: null },
    estimatedDelivery: { type: Date, default: null },
    placedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("Order", schema);
