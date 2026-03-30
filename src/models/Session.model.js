const mongoose = require("mongoose");
const crypto = require("crypto");

// ─── Per-device session (replaces single refreshToken on User) ─────────────────
const sessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // ── Refresh token (stored as SHA-256 hash) ──────────────────────────────
    refreshTokenHash: { type: String, select: false },

    // ── Device identification ───────────────────────────────────────────────
    deviceId:   { type: String, required: true },          // client UUID, stable per install
    deviceName: { type: String, default: "Unknown Device" },
    deviceType: { type: String, enum: ["mobile", "tablet", "web", "desktop"], default: "mobile" },
    deviceOS:   { type: String },                          // "iOS 17.2", "Android 14"
    platform:   { type: String, enum: ["ios", "android", "web", "desktop"], default: "web" },
    appVersion: { type: String },
    fcmToken:   { type: String },                          // Firebase Cloud Messaging

    // ── Biometric auth ──────────────────────────────────────────────────────
    biometricEnabled:     { type: Boolean, default: false },
    biometricTokenHash:   { type: String, select: false },  // SHA-256 of device-stored token
    biometricTokenExpiry: { type: Date },

    // ── PIN fallback ────────────────────────────────────────────────────────
    pinEnabled:        { type: Boolean, default: false },
    pinHash:           { type: String, select: false },     // bcrypt hash
    pinFailedAttempts: { type: Number, default: 0 },
    pinLockedUntil:    { type: Date },

    // ── User preferences (stored per device) ────────────────────────────────
    language: { type: String, default: "ar" },
    timezone: { type: String, default: "Asia/Riyadh" },

    // ── Network metadata ────────────────────────────────────────────────────
    ipAddress: { type: String },
    userAgent: { type: String },

    // ── Session state ───────────────────────────────────────────────────────
    lastUsed:  { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    isActive:  { type: Boolean, default: true },
  },
  { timestamps: true }
);

// One active session per device (upsert on re-login from same device)
sessionSchema.index({ deviceId: 1 }, { unique: true });
sessionSchema.index({ user: 1, isActive: 1 });
// MongoDB auto-removes expired sessions
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ─── Helpers ───────────────────────────────────────────────────────────────────
sessionSchema.statics.hashToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

sessionSchema.statics.SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

module.exports = mongoose.model("Session", sessionSchema);
