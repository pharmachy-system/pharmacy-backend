const mongoose = require("mongoose");

const returnItemSchema = new mongoose.Schema({
  medicine: { type: mongoose.Schema.Types.ObjectId, ref: "Medicine" },
  name:     { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  price:    { type: Number, required: true },
  reason:   {
    type: String,
    enum: ["damaged", "wrong_item", "quality_issue", "changed_mind", "expired", "other"],
    required: true,
  },
}, { _id: false });

const returnTrackingSchema = new mongoose.Schema({
  status:    { type: String, required: true },
  note:      { type: String, default: "" },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const returnSchema = new mongoose.Schema({
  returnNumber:      { type: String, unique: true },
  order:             { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
  user:              { type: mongoose.Schema.Types.ObjectId, ref: "User",  required: true },
  items:             { type: [returnItemSchema], required: true },
  returnType:        { type: String, enum: ["full", "partial"], required: true },
  status:            {
    type: String,
    enum: ["pending", "approved", "rejected", "processing", "completed"],
    default: "pending",
  },
  refundMethod:      { type: String, enum: ["wallet", "original_payment"], default: "wallet" },
  totalRefundAmount: { type: Number, required: true },
  adminNote:         { type: String },
  rejectionReason:   { type: String },
  processedBy:       { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  processedAt:       { type: Date },
  completedAt:       { type: Date },
  stockRestored:     { type: Boolean, default: false },
  trackingHistory:   [returnTrackingSchema],
}, { timestamps: true });

returnSchema.index({ user: 1, createdAt: -1 });
returnSchema.index({ order: 1 });
returnSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Return", returnSchema);
