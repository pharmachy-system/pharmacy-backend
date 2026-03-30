const mongoose = require("mongoose");

const flashSaleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  discount: { type: Number, required: true, min: 1, max: 99 },
  medicines: [{ type: mongoose.Schema.Types.ObjectId, ref: "Medicine" }],
  banner: { url: String, public_id: String },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

flashSaleSchema.virtual("isLive").get(function () {
  const now = new Date();
  return this.isActive && now >= this.startDate && now <= this.endDate;
});

module.exports = mongoose.model("FlashSale", flashSaleSchema);
