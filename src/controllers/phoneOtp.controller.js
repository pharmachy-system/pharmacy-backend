/**
 * Phone OTP Login Controller
 *
 * Flow:
 *   1. POST /api/auth/login/phone/send   { phone }
 *      → generates 6-digit OTP (5-min expiry), sends via SMS
 *      → 60-second cooldown between any sends
 *   2. POST /api/auth/login/phone/verify { phone, otp, deviceId, … }
 *      → verifies OTP, auto-creates account if first login, returns tokens
 *   3. POST /api/auth/login/phone/resend { phone }
 *      → same as send but additionally enforces 3/hr per user limit
 *
 * Rate limits:
 *   send:   otpLimiter  (5 per 15 min, IP-based)
 *   resend: otpLimiter  (5 per 15 min, IP-based) + per-user 3/hr (server-side)
 *   verify: otpLimiter
 */

const crypto = require("crypto");
const User = require("../models/User.model");
const sendSMS = require("../utils/sms.util");
const { extractDeviceInfo, upsertSession } = require("../utils/session.util");
const { generateAccessToken, generateRefreshToken } = require("../utils/token.util");

const OTP_COOLDOWN_MS = 60 * 1000;       // 60 s between any two sends
const OTP_EXPIRY_MS   = 5 * 60 * 1000;  // OTP valid for 5 min
const RESEND_WINDOW_MS  = 60 * 60 * 1000; // 1 hour window for resend limit
const MAX_RESENDS_PER_HOUR = 3;

// In-memory resend tracker (per phone number); for multi-instance deployments
// replace with Redis INCR + EXPIRE.
const resendTracker = new Map(); // phone → [timestamps]

function countRecentResends(phone) {
  const now = Date.now();
  const times = (resendTracker.get(phone) || []).filter((t) => now - t < RESEND_WINDOW_MS);
  resendTracker.set(phone, times);
  return times.length;
}

function recordResend(phone) {
  const times = resendTracker.get(phone) || [];
  times.push(Date.now());
  resendTracker.set(phone, times);
}

// ─── Core OTP send logic ──────────────────────────────────────────────────────
async function doSendOTP(phone, req, res, next) {
  let user = await User.findOne({ phone })
    .select("+phoneOTP +phoneOTPExpire +phoneOTPLastSent");

  // 60-second per-user cooldown
  if (user?.phoneOTPLastSent) {
    const elapsed = Date.now() - new Date(user.phoneOTPLastSent).getTime();
    if (elapsed < OTP_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_COOLDOWN_MS - elapsed) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${wait} second(s) before requesting a new OTP`,
        code:    "OTP_COOLDOWN",
        cooldownSeconds: wait,
      });
    }
  }

  if (!user) {
    user = new User({ name: `User_${phone.slice(-4)}`, phone, isPhoneVerified: false });
  }

  const otp = user.generatePhoneOTP();
  await user.save({ validateBeforeSave: false });

  try {
    await sendSMS({
      to:   phone,
      body: `Your Pharmacy verification code is: ${otp}\nValid for 5 minutes. Do not share this code.`,
    });
  } catch (smsErr) {
    // SMS failure should not expose the OTP
    return next(smsErr);
  }

  res.json({
    success:   true,
    message:   "OTP sent successfully",
    expiresIn: 300,
    cooldown:  60,
  });
}

// ─── Send OTP ─────────────────────────────────────────────────────────────────
exports.sendOTP = async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: "Phone number is required" });
    await doSendOTP(phone, req, res, next);
  } catch (err) {
    next(err);
  }
};

// ─── Resend OTP (additional per-user 3/hr limit) ──────────────────────────────
exports.resendOTP = async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: "Phone number is required" });

    const recent = countRecentResends(phone);
    if (recent >= MAX_RESENDS_PER_HOUR) {
      return res.status(429).json({
        success: false,
        message: "Maximum OTP resend limit reached. Please try again in 1 hour.",
        code:    "RESEND_LIMIT_REACHED",
        maxPerHour: MAX_RESENDS_PER_HOUR,
      });
    }

    recordResend(phone);
    await doSendOTP(phone, req, res, next);
  } catch (err) {
    next(err);
  }
};

// ─── Verify OTP → issue tokens ────────────────────────────────────────────────
exports.verifyOTP = async (req, res, next) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: "phone and otp are required" });
    }

    const hashed = crypto.createHash("sha256").update(String(otp)).digest("hex");

    const user = await User.findOne({
      phone,
      phoneOTP:       hashed,
      phoneOTPExpire: { $gt: new Date() },
    }).select("+phoneOTP +phoneOTPExpire +loginFailedAttempts +loginLockoutUntil +loginCount");

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP", code: "INVALID_OTP" });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: "Account is deactivated" });
    }

    // Clear OTP fields
    user.phoneOTP        = undefined;
    user.phoneOTPExpire  = undefined;
    user.isPhoneVerified = true;

    // Phone-only accounts get a placeholder email (required field on User schema)
    if (!user.email) {
      user.email = `${phone.replace(/\D/g, "")}@phone.pharmacy.local`;
    }

    // Track login
    const now = new Date();
    user.loginCount  = (user.loginCount || 0) + 1;
    user.lastLogin   = now;
    user.lastLoginAt = now;
    user.resetLoginAttempts();

    const accessToken  = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    user.refreshToken  = refreshToken;
    await user.save({ validateBeforeSave: false });

    // Clear resend counter on successful verify
    resendTracker.delete(phone);

    const deviceInfo = extractDeviceInfo(req);
    await upsertSession(user._id, refreshToken, deviceInfo, req);

    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id:              user._id,
        name:            user.name,
        phone:           user.phone,
        role:            user.role,
        userType:        user.role === "customer" ? "patient" : user.role,
        isPhoneVerified: true,
        isReturningUser: user.loginCount > 1,
        loginCount:      user.loginCount,
        lastLoginAt:     user.lastLoginAt,
      },
    });
  } catch (err) {
    next(err);
  }
};
