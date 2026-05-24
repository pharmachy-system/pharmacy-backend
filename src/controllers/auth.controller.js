// Node built-ins
const crypto = require("crypto");

// Third-party
const jwt = require("jsonwebtoken");

// Models
const User    = require("../models/User.model");
const Session = require("../models/Session.model");

// Utils
const { generateAccessToken, generateRefreshToken } = require("../utils/token.util");
const { extractDeviceInfo, upsertSession }          = require("../utils/session.util");
const { sendOtpEmail, sendPasswordResetEmail }      = require("../utils/email.util");

const userPayload = (user) => ({
  id:              user._id,
  name:            user.name,
  email:           user.email,
  role:            user.role,
  phone:           user.phone,
  avatar:          user.avatar,
  isEmailVerified: user.isEmailVerified,
  isPhoneVerified: user.isPhoneVerified,
  loyaltyPoints:   user.loyaltyPoints,
  referralCode:    user.referralCode,
  nafathVerified:  user.nafathVerified,
});

// Shared login success handler: create tokens + session + return response
const issueTokensAndRespond = async (res, user, deviceInfo, req, statusCode = 200) => {
  const accessToken  = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  // Keep user.refreshToken in sync for backwards compat
  user.refreshToken = refreshToken;
  user.lastLogin    = new Date();
  user.resetLoginAttempts();
  await user.save({ validateBeforeSave: false });

  // Persist session per device
  await upsertSession(user._id, refreshToken, deviceInfo, req);

  return res.status(statusCode).json({
    success: true,
    accessToken,
    refreshToken,
    user: userPayload(user),
  });
};

// ─── Register ─────────────────────────────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, phone, referralCode, role } = req.body;

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ success: false, message: "Email already registered" });
    }

    const userData = { name, email, password, phone };

    // Restricted roles require admin secret
    const restrictedRoles = ["admin", "delivery"];
    if (role && !restrictedRoles.includes(role)) {
      userData.role = role;
    } else if (role && restrictedRoles.includes(role) && req.body.adminSecret === process.env.ADMIN_REGISTRATION_SECRET) {
      userData.role = role;
    }

    if (referralCode) {
      const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
      if (referrer) userData.referredBy = referrer._id;
    }

    const user = await User.create(userData);

    // Send OTP verification email (non-blocking)
    const otp = user.generateOTP();
    await user.save({ validateBeforeSave: false });
    try {
      await sendOtpEmail(user, otp, "التحقق من البريد الإلكتروني | Email Verification", 10);
    } catch { /* non-blocking */ }

    const deviceInfo = extractDeviceInfo(req);
    return issueTokensAndRespond(res, user, deviceInfo, req, 201);
  } catch (err) {
    next(err);
  }
};

// ─── Login (Email + Password) — backwards-compatible ─────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email })
      .select("+password +refreshToken +loginFailedAttempts +loginLockoutUntil");

    if (!user || !(await user.matchPassword(password))) {
      if (user) {
        user.recordFailedLogin();
        await user.save({ validateBeforeSave: false });
      }
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: `Account is deactivated${user.blockedReason ? ": " + user.blockedReason : ""}` });
    }
    if (user.isLockedOut()) {
      const mins = Math.ceil((user.loginLockoutUntil - Date.now()) / 60000);
      return res.status(429).json({ success: false, message: `Account locked. Try again in ${mins} minute(s).` });
    }

    const deviceInfo = extractDeviceInfo(req);
    return issueTokensAndRespond(res, user, deviceInfo, req);
  } catch (err) {
    next(err);
  }
};

// ─── Login (Email) — dedicated endpoint with strict lockout ───────────────────
// Alias of login; kept separate so clients can target /login/email explicitly.
exports.loginEmail = exports.login;

// ─── Refresh Token ────────────────────────────────────────────────────────────
exports.refreshToken = async (req, res, next) => {
  try {
    const { token, deviceId } = req.body;
    if (!token) return res.status(401).json({ success: false, message: "No refresh token provided" });

    // Verify JWT signature + expiry
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(403).json({ success: false, message: "Refresh token expired or invalid" });
    }

    const tokenHash = Session.hashToken(token);

    // ── Try session-based lookup first ──────────────────────────────────────
    let session = null;
    if (deviceId) {
      session = await Session.findOne({ deviceId, isActive: true }).select("+refreshTokenHash");
    } else {
      session = await Session.findOne({ user: decoded.id, refreshTokenHash: tokenHash, isActive: true })
        .select("+refreshTokenHash");
    }

    if (session) {
      if (session.refreshTokenHash !== tokenHash) {
        return res.status(403).json({ success: false, message: "Invalid refresh token" });
      }
      const user = await User.findById(decoded.id);
      if (!user || !user.isActive) {
        return res.status(403).json({ success: false, message: "User not found or deactivated" });
      }

      const accessToken     = generateAccessToken(user._id);
      const newRefreshToken = generateRefreshToken(user._id);

      session.refreshTokenHash = Session.hashToken(newRefreshToken);
      session.lastUsed  = new Date();
      session.expiresAt = new Date(Date.now() + Session.SESSION_EXPIRY_MS);
      await session.save();

      user.refreshToken = newRefreshToken;
      await user.save({ validateBeforeSave: false });

      return res.json({ success: true, accessToken, refreshToken: newRefreshToken });
    }

    // ── Fallback: user.refreshToken (legacy / no deviceId) ─────────────────
    const user = await User.findById(decoded.id).select("+refreshToken");
    if (!user || user.refreshToken !== token) {
      return res.status(403).json({ success: false, message: "Invalid refresh token" });
    }

    const accessToken     = generateAccessToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);
    user.refreshToken = newRefreshToken;
    await user.save({ validateBeforeSave: false });

    return res.json({ success: true, accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    next(err);
  }
};

// ─── Logout (current device) ──────────────────────────────────────────────────
exports.logout = async (req, res, next) => {
  try {
    const { deviceId } = req.body;

    if (deviceId) {
      await Session.findOneAndUpdate({ deviceId, user: req.user._id }, { isActive: false });
    }
    // Also clear user-level token (legacy)
    await User.findByIdAndUpdate(req.user._id, { refreshToken: null });

    res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
};

// ─── Logout All Devices ───────────────────────────────────────────────────────
exports.logoutAll = async (req, res, next) => {
  try {
    await Session.updateMany({ user: req.user._id }, { isActive: false, refreshTokenHash: null });
    await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
    res.json({ success: true, message: "Logged out from all devices" });
  } catch (err) {
    next(err);
  }
};

// ─── Check Session (app startup) ─────────────────────────────────────────────
// Client hits this with their stored access token on app launch.
// Returns user + whether the token is still fresh (< 5 min from expiry).
exports.checkSession = async (req, res) => {
  const { deviceId } = req.query;
  let sessionInfo = {};

  if (deviceId) {
    const session = await Session.findOne({ deviceId, user: req.user._id, isActive: true })
      .select("biometricEnabled pinEnabled language timezone deviceName platform lastUsed expiresAt");
    if (session) {
      sessionInfo = {
        biometricEnabled: session.biometricEnabled,
        pinEnabled:       session.pinEnabled,
        language:         session.language,
        timezone:         session.timezone,
        deviceName:       session.deviceName,
        platform:         session.platform,
        lastUsed:         session.lastUsed,
        sessionExpiresAt: session.expiresAt,
      };
    }
  }

  res.json({ success: true, user: userPayload(req.user), session: sessionInfo });
};

// ─── Get Me ───────────────────────────────────────────────────────────────────
exports.getMe = (req, res) => res.json({ success: true, user: userPayload(req.user) });

// ─── Verify Email OTP ─────────────────────────────────────────────────────────
exports.verifyEmail = async (req, res, next) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ success: false, message: "OTP is required" });

    const hashed = crypto.createHash("sha256").update(otp).digest("hex");
    const user = await User.findOne({
      _id: req.user._id,
      emailOTP: hashed,
      emailOTPExpire: { $gt: Date.now() },
    }).select("+emailOTP +emailOTPExpire");

    if (!user) return res.status(400).json({ success: false, message: "Invalid or expired OTP" });

    user.isEmailVerified = true;
    user.emailOTP = undefined;
    user.emailOTPExpire = undefined;
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, message: "Email verified successfully" });
  } catch (err) {
    next(err);
  }
};

// ─── Resend Email OTP ─────────────────────────────────────────────────────────
exports.resendOTP = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (user.isEmailVerified) {
      return res.status(400).json({ success: false, message: "Email already verified" });
    }

    const otp = user.generateOTP();
    await user.save({ validateBeforeSave: false });

    await sendOtpEmail(user, otp, "التحقق من البريد الإلكتروني | Email Verification", 10);

    res.json({ success: true, message: "OTP sent to your email" });
  } catch (err) {
    next(err);
  }
};

// ─── Forgot Password ──────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.json({ success: true, message: "If that email exists, a reset link has been sent" });
    }

    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;

    try {
      await sendPasswordResetEmail(user, resetUrl);
    } catch {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      return res.status(500).json({ success: false, message: "Email could not be sent" });
    }

    res.json({ success: true, message: "If that email exists, a reset link has been sent" });
  } catch (err) {
    next(err);
  }
};

// ─── Reset Password ───────────────────────────────────────────────────────────
exports.resetPassword = async (req, res, next) => {
  try {
    const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });
    if (!user) return res.status(400).json({ success: false, message: "Token is invalid or has expired" });

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.refreshToken = null;
    await user.save();

    // Invalidate all sessions after password reset
    await Session.updateMany({ user: user._id }, { isActive: false });

    res.json({ success: true, message: "Password reset successful. Please log in." });
  } catch (err) {
    next(err);
  }
};

// ─── Social Login (Google / Apple) ───────────────────────────────────────────
exports.socialLogin = async (req, res, next) => {
  try {
    const { provider, socialId, name, email, avatar } = req.body;

    if (!["google", "apple"].includes(provider)) {
      return res.status(400).json({ success: false, message: "Unsupported provider" });
    }
    if (!socialId || !email) {
      return res.status(400).json({ success: false, message: "socialId and email are required" });
    }

    let user = await User.findOne({ $or: [{ socialId, socialProvider: provider }, { email }] });

    if (user) {
      if (!user.socialId) {
        user.socialId = socialId;
        user.socialProvider = provider;
        if (avatar && !user.avatar) user.avatar = avatar;
        await user.save({ validateBeforeSave: false });
      }
    } else {
      user = await User.create({ name, email, socialId, socialProvider: provider, avatar, isEmailVerified: true });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: "Account is deactivated" });
    }

    const deviceInfo = extractDeviceInfo(req);
    return issueTokensAndRespond(res, user, deviceInfo, req);
  } catch (err) {
    next(err);
  }
};

// ─── Change Password (authenticated) ─────────────────────────────────────────
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "currentPassword and newPassword are required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: "New password must be at least 8 characters" });
    }

    const user = await User.findById(req.user._id).select("+password");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Current password is incorrect" });
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    next(err);
  }
};

