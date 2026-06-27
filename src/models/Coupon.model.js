const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  description: { type: String },
  type: { type: String, enum: ["percentage", "fixed"], required: true },
  value: { type: Number, required: true, min: 0 },
  minOrderAmount: { type: Number, default: 0 },
  maxDiscount: { type: Number },
  usageLimit: { type: Number, default: null },
  usageCount: { type: Number, default: 0 },
  perUserLimit: { type: Number, default: 1 },
  usedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  validFrom: { type: Date, required: true },
  validUntil: { type: Date, required: true },
  applicableTo: { type: String, enum: ["all", "category", "medicine"], default: "all" },
  isActive: { type: Boolean, default: true },
  isFirstOrderOnly: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

couponSchema.index({ isActive: 1, validFrom: 1, validUntil: 1 }); // coupon validity check
couponSchema.index({ code: 1, isActive: 1 });                     // code lookup by status

couponSchema.methods.isValid = function () {
  const now = new Date();
  return this.isActive && now >= this.validFrom && now <= this.validUntil &&
    (this.usageLimit === null || this.usageCount < this.usageLimit);
};

module.exports = mongoose.model("Coupon", couponSchema);
