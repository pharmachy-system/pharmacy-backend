const mongoose = require("mongoose");

const prescriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  doctor: { type: String, required: true, trim: true },
  hospitalClinic: { type: String, trim: true },
  images: [{ url: String, public_id: String }],
  medicines: [{ name: String, dosage: String, frequency: String, duration: String }],
  status: { type: String, enum: ["pending", "under_review", "approved", "rejected", "expired"], default: "pending" },
  expiryDate: { type: Date },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: { type: Date },
  rejectionReason: { type: String },
  notes: { type: String, trim: true },
  isUsed: { type: Boolean, default: false },
}, { timestamps: true });

prescriptionSchema.index({ user: 1, status: 1 });
module.exports = mongoose.model("Prescription", prescriptionSchema);
