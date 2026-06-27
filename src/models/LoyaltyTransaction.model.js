const mongoose = require("mongoose");

const loyaltyTransactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["earn", "redeem", "expire", "bonus", "referral", "adjustment"], required: true },
  points: { type: Number, required: true },
  balance: { type: Number, required: true },
  description: { type: String, required: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
  expiresAt: { type: Date },
}, { timestamps: true });

loyaltyTransactionSchema.index({ user: 1, createdAt: -1 });
loyaltyTransactionSchema.index({ user: 1, type: 1 });            // history filtered by type
loyaltyTransactionSchema.index({ order: 1 }, { sparse: true });
// Auto-expire records 1 year after their points expire (for record-keeping)
loyaltyTransactionSchema.index({ expiresAt: 1 }, { sparse: true, expireAfterSeconds: 365 * 24 * 60 * 60 });
module.exports = mongoose.model("LoyaltyTransaction", loyaltyTransactionSchema);
