const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  balance: { type: Number, default: 0, min: 0 },
  transactions: [{
    type: { type: String, enum: ["credit", "debit", "refund"], required: true },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    reference: { type: String },
    balanceAfter: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now },
  }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model("Wallet", walletSchema);
