const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["order", "prescription", "promotion", "reminder", "system", "delivery"], required: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed },
  isRead: { type: Boolean, default: false },
  readAt: { type: Date },
  channels: [{ type: String, enum: ["push", "email", "sms"] }],
}, { timestamps: true });

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
module.exports = mongoose.model("Notification", notificationSchema);
