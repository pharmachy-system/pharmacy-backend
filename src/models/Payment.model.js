const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  method: { type: String, enum: ["cash", "card", "wallet"], required: true },
  status: { type: String, enum: ["pending", "completed", "failed", "refunded", "disputed"], default: "pending" },
  amount: { type: Number, required: true },
  currency: { type: String, default: "SAR" },
  transactionId: { type: String },
  stripePaymentIntentId: { type: String },
  stripeChargeId: { type: String },
  refundAmount: { type: Number, default: 0 },
  refundReason: { type: String },
  refundedAt: { type: Date },
  paidAt: { type: Date },
}, { timestamps: true });

paymentSchema.index({ order: 1 });
paymentSchema.index({ user: 1, createdAt: -1 });
paymentSchema.index({ stripePaymentIntentId: 1 }, { sparse: true });
paymentSchema.index({ stripeChargeId: 1 }, { sparse: true });
paymentSchema.index({ status: 1, createdAt: -1 });
module.exports = mongoose.model("Payment", paymentSchema);
