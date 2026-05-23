/**
 * Phone OTP Login Controller
 *
 * Flow:
 *   1. POST /api/auth/login/phone/send   { phone }
 *      → generates 6-digit OTP (5-min expiry), sends via SMS
 *      → 60-second cooldown between sends
 *   2. POST /api/auth/login/phone/verify { phone, otp, deviceId, … }
 *      → verifies OTP, auto-creates account if first login, returns tokens
 *   3. POST /api/auth/login/phone/resend { phone }
 *      → same as send but enforces 60-second cooldown
 */

const crypto = require("crypto");
const User = require("../../models/User.model");
const sendSMS = require("../../utils/sms.util");
const { extractDeviceInfo, upsertSession } = require("../../utils/session.util");
const { generateAccessToken, generateRefreshToken } = require("../../utils/token.util");

const OTP_COOLDOWN_MS = 60 * 1000;      // 60 seconds between sends
const OTP_EXPIRY_MS   = 5 * 60 * 1000; // 5 minutes

// ─── Send OTP ─────────────────────────────────────────────────────────────────
exports.sendOTP = async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: "Phone number is required" });

    let user = await User.findOne({ phone })
      .select("+phoneOTP +phoneOTPExpire +phoneOTPLastSent");

    // Enforce cooldown on existing users
    if (user?.phoneOTPLastSent) {
      const elapsed = Date.now() - new Date(user.phoneOTPLastSent).getTime();
      if (elapsed < OTP_COOLDOWN_MS) {
        const wait = Math.ceil((OTP_COOLDOWN_MS - elapsed) / 1000);
        return res.status(429).json({
          success: false,
          message: `Please wait ${wait} second(s) before requesting a new OTP`,
          cooldownSeconds: wait,
        });
      }
    }

    // Create a stub user if this is the first login (no account yet)
    if (!user) {
      user = new User({ name: `User_${phone.slice(-4)}`, phone, isPhoneVerified: false });
    }

    const otp = user.generatePhoneOTP();
    await user.save({ validateBeforeSave: false });

    await sendSMS({
      to: phone,
      body: `Your Pharmacy verification code is: ${otp}\nValid for 5 minutes. Do not share this code.`,
    });

    res.json({
      success: true,
      message: "OTP sent successfully",
      expiresIn: 300,       // seconds
      cooldown:  60,        // seconds until resend is allowed
    });
  } catch (err) {
    next(err);
  }
};

// ─── Resend OTP (same as send, cooldown enforced) ────────────────────────────
exports.resendOTP = exports.sendOTP;

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
    }).select("+phoneOTP +phoneOTPExpire +loginFailedAttempts +loginLockoutUntil");

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: "Account is deactivated" });
    }

    // Clear OTP fields
    user.phoneOTP       = undefined;
    user.phoneOTPExpire = undefined;
    user.isPhoneVerified = true;

    // If no email yet, mark as phone-only account
    if (!user.email) {
      user.email = `${phone.replace(/\D/g, "")}@phone.pharmacy.local`; // placeholder
    }

    // Issue tokens
    const accessToken  = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    user.lastLogin    = new Date();
    user.resetLoginAttempts();
    await user.save({ validateBeforeSave: false });

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
        isPhoneVerified: user.isPhoneVerified,
        isNewUser:       !user.isEmailVerified && !user.email.includes("@phone.pharmacy.local") === false,
      },
    });
  } catch (err) {
    next(err);
  }
};
