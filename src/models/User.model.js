const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const addressSchema = new mongoose.Schema({
  label: { type: String, enum: ["home", "work", "other"], default: "home" },
  fullName: { type: String, required: true },
  phone: { type: String, required: true },
  street: { type: String, required: true },
  city: { type: String, required: true },
  region: { type: String },
  postalCode: { type: String },
  country: { type: String, default: "SA" },
  lat: Number, lng: Number,
  isDefault: { type: Boolean, default: false },
}, { _id: true });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  password: { type: String, minlength: 6, select: false },
  avatar: { type: String, default: null },
  role: { type: String, enum: ["customer", "pharmacist", "admin", "delivery"], default: "customer" },
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  emailOTP: { type: String, select: false },
  emailOTPExpire: { type: Date, select: false },
  isPhoneVerified: { type: Boolean, default: false },
  refreshToken: { type: String, select: false },
  resetPasswordToken: { type: String, select: false },
  resetPasswordExpire: { type: Date, select: false },
  socialId: { type: String },
  socialProvider: { type: String, enum: ["google", "apple"] },
  addresses: [addressSchema],
  loyaltyPoints: { type: Number, default: 0, min: 0 },
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  wallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet" },
  fcmToken: { type: String },
  gender: { type: String, enum: ["male", "female"] },
  birthDate: { type: Date },
  language: { type: String, enum: ["ar", "en"], default: "ar" },
  timezone: { type: String },
  blockedReason: { type: String },
  referralRewardClaimed: { type: Boolean, default: false },

  // ── Phone OTP (login via SMS) ──────────────────────────────────────────────
  phoneOTP:         { type: String, select: false },
  phoneOTPExpire:   { type: Date, select: false },
  phoneOTPLastSent: { type: Date, select: false },

  // ── Nafath (Saudi National Digital ID) ────────────────────────────────────
  nafathId:       { type: String },
  nafathVerified: { type: Boolean, default: false },

  // ── Login lockout ──────────────────────────────────────────────────────────
  loginFailedAttempts: { type: Number, default: 0 },
  loginLockoutUntil:   { type: Date },

  // ── Login tracking ─────────────────────────────────────────────────────────
  loginCount:   { type: Number, default: 0 },
  lastLoginAt:  { type: Date },

  // ── Driver fields (role: delivery only) ───────────────────────────────────
  driverStatus: {
    type:    String,
    enum:    ["available", "busy", "offline"],
    default: "offline",
  },
  driverLocation: {
    lat:       { type: Number },
    lng:       { type: Number },
    updatedAt: { type: Date },
  },

  // ── Device info (one record per deviceId, updated on each login) ───────────
  deviceInfo: [{
    deviceId:       { type: String, required: true },
    deviceLocale:   { type: String },
    deviceLanguage: { type: String },
    platform:       { type: String, enum: ["ios", "android", "web", "desktop"], default: "web" },
    lastSeen:       { type: Date, default: Date.now },
    _id: false,
  }],

  // ── Recently viewed (capped at 20 items, newest first) ────────────────────
  recentlyViewed: [{
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: "Medicine" },
    viewedAt: { type: Date, default: Date.now },
    _id: false,
  }],

  // ── Passkeys / WebAuthn ───────────────────────────────────────────────────
  passkeys: [{
    credentialId:    { type: String, required: true },
    credentialRawId: { type: String },
    publicKey:       { type: String },
    signCount:       { type: Number, default: 0 },
    deviceType:      { type: String, default: 'unknown' },
    registeredAt:    { type: Date, default: Date.now },
    lastUsed:        { type: Date, default: null },
  }],
}, { timestamps: true });

userSchema.index({ phone: 1 }, { sparse: true });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ isActive: 1 });
// Social login lookup
userSchema.index({ socialProvider: 1, socialId: 1 }, { sparse: true });
// Driver availability queries
userSchema.index({ driverStatus: 1 }, { sparse: true, partialFilterExpression: { role: "delivery" } });
// Nafath verification lookup
userSchema.index({ nafathId: 1 }, { sparse: true });
// Password reset token lookup
userSchema.index({ resetPasswordToken: 1 }, { sparse: true });

userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.pre("save", function (next) {
  if (this.isNew && !this.referralCode) {
    this.referralCode = crypto.randomBytes(4).toString("hex").toUpperCase();
  }
  next();
});

userSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

userSchema.methods.getResetPasswordToken = function () {
  const token = crypto.randomBytes(32).toString("hex");
  this.resetPasswordToken = crypto.createHash("sha256").update(token).digest("hex");
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
  return token;
};

userSchema.methods.generateOTP = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.emailOTP = crypto.createHash("sha256").update(otp).digest("hex");
  this.emailOTPExpire = Date.now() + 10 * 60 * 1000;
  return otp;
};

// ── Phone OTP (5-min expiry) ───────────────────────────────────────────────────
userSchema.methods.generatePhoneOTP = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.phoneOTP = crypto.createHash("sha256").update(otp).digest("hex");
  this.phoneOTPExpire = Date.now() + 5 * 60 * 1000;
  this.phoneOTPLastSent = new Date();
  return otp;
};

// ── Login lockout helpers ──────────────────────────────────────────────────────
userSchema.methods.isLockedOut = function () {
  return !!(this.loginLockoutUntil && this.loginLockoutUntil > Date.now());
};

userSchema.methods.recordFailedLogin = function () {
  this.loginFailedAttempts = (this.loginFailedAttempts || 0) + 1;
  if (this.loginFailedAttempts >= 5) {
    this.loginLockoutUntil = new Date(Date.now() + 15 * 60 * 1000); // 15-min lockout
  }
};

userSchema.methods.resetLoginAttempts = function () {
  this.loginFailedAttempts = 0;
  this.loginLockoutUntil = undefined;
};

module.exports = mongoose.model("User", userSchema);
