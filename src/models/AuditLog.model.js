const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  actor:       { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  actorEmail:  { type: String },
  actorRole:   { type: String },
  action:      { type: String, required: true },    // e.g. "CREATE", "UPDATE", "DELETE"
  resource:    { type: String, required: true },    // e.g. "Medicine", "User", "Coupon"
  resourceId:  { type: mongoose.Schema.Types.ObjectId },
  changes:     { type: mongoose.Schema.Types.Mixed }, // diff / payload summary
  ip:          { type: String },
  userAgent:   { type: String },
  requestId:   { type: String },
  statusCode:  { type: Number },
  durationMs:  { type: Number },
  meta:        { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
