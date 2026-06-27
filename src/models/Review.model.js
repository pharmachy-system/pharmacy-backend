const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  medicine: { type: mongoose.Schema.Types.ObjectId, ref: "Medicine", required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String, trim: true, maxlength: 100 },
  comment: { type: String, trim: true, maxlength: 1000 },
  isVerifiedPurchase: { type: Boolean, default: false },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  helpfulCount: { type: Number, default: 0 },
  helpfulVotes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  replyBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reply: { type: String },
  repliedAt: { type: Date },
}, { timestamps: true });

reviewSchema.index({ medicine: 1, status: 1, createdAt: -1 }); // approved reviews ordered by time
reviewSchema.index({ medicine: 1, user: 1 }, { unique: true }); // one review per user per medicine
reviewSchema.index({ user: 1, createdAt: -1 });                 // user's review history
module.exports = mongoose.model("Review", reviewSchema);
