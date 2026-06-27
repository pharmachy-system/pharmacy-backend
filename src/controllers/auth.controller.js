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

// ─── Role → userType mapping ──────────────────────────────────────────────────
const ROLE_TO_USER_TYPE = {
  customer:    "patient",
  pharmacist:  "pharmacist",
  admin:       "admin",
  delivery:    "driver",
};

// ─── Build public user payload ────────────────────────────────────────────────
const userPayload = (user) => ({
  id:              user._id,
  name:            user.name,
  email:           user.email,
  role:            user.role,
  userType:        ROLE_TO_USER_TYPE[user.role] || user.role,
  phone:           user.phone,
  avatar:          user.avatar,
  isEmailVerified: user.isEmailVerified,
  isPhoneVerified: user.isPhoneVerified,
  loyaltyPoints:   user.loyaltyPoints,
  referralCode:    user.referralCode,
  nafathVerified:  user.nafathVerified,
  loginCount:      user.loginCount || 0,
  isReturningUser: (user.loginCount || 0) > 1,
  lastLoginAt:     user.lastLoginAt || null,
});

// ─── Shared login success handler ─────────────────────────────────────────────
// Creates tokens, upserts session, increments loginCount, responds.
const issueTokensAndRespond = async (res, user, deviceInfo, req, { statusCode = 200, rememberDevice = false } = {}) => {
  const accessToken  = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  const now = new Date();
  user.refreshToken  = refreshToken;
  user.lastLoginAt   = now;
  user.loginCount    = (user.loginCount || 0) + 1;
  user.resetLoginAttempts();
  await user.save({ validateBeforeSave: false });

  await upsertSession(user._id, refreshToken, deviceInfo, req, { rememberDevice });

  return res.status(statusCode).json({
    success:      true,
    accessToken,
    refreshToken,
    user:         userPayload(user),
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

    const otp = user.generateOTP();
    await user.save({ validateBeforeSave: false });
    try {
      await sendOtpEmail(user, otp, "التحقق من البريد الإلكتروني | Email Verification", 10);
    } catch { /* non-blocking */ }

    const deviceInfo = extractDeviceInfo(req);
    return issueTokensAndRespond(res, user, deviceInfo, req, { statusCode: 201 });
  } catch (err) {
    next(err);
  }
};

// ─── Login (Email + Password) ─────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { email, password, rememberDevice = false } = req.body;

    const user = await User.findOne({ email })
      .select("+password +refreshToken +loginFailedAttempts +loginLockoutUntil +loginCount");

    // Check lockout before password attempt (avoids timing leak)
    if (user?.isLockedOut()) {
      const mins = Math.ceil((user.loginLockoutUntil - Date.now()) / 60000);
      return res.status(429).json({
        success: false,
        message: `Account temporarily locked. Try again in ${mins} minute(s).`,
        code:    "ACCOUNT_LOCKED",
        retryAfter: Math.ceil((user.loginLockoutUntil - Date.now()) / 1000),
      });
    }

    if (!user || !(await user.matchPassword(password))) {
      if (user) {
        user.recordFailedLogin();
        await user.save({ validateBeforeSave: false });

        const attemptsLeft = Math.max(0, 5 - user.loginFailedAttempts);
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
          code:    "INVALID_CREDENTIALS",
          attemptsLeft: user.isLockedOut() ? 0 : attemptsLeft,
        });
      }
      return res.status(401).json({ success: false, message: "Invalid email or password", code: "INVALID_CREDENTIALS" });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: `Account is deactivated${user.blockedReason ? ": " + user.blockedReason : ""}`,
        code:    "ACCOUNT_DEACTIVATED",
      });
    }

    const deviceInfo = extractDeviceInfo(req);
    return issueTokensAndRespond(res, user, deviceInfo, req, { rememberDevice });
  } catch (err) {
    next(err);
  }
};

// Alias — /login/email
exports.loginEmail = exports.login;

// ─── Refresh Token ────────────────────────────────────────────────────────────
exports.refreshToken = async (req, res, next) => {
  try {
    const { token, deviceId } = req.body;
    if (!token) return res.status(401).json({ success: false, message: "No refresh token provided" });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(403).json({ success: false, message: "Refresh token expired or invalid" });
    }

    const tokenHash = Session.hashToken(token);

    let session = null;
    if (deviceId) {
      session = await Session.findOne({ user: decoded.id, deviceId, isActive: true }).select("+refreshTokenHash");
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

    // Fallback: legacy user.refreshToken
    const user = await User.findById(decoded.id).select("+refreshToken +loginCount");
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

// ─── Logout ───────────────────────────────────────────────────────────────────
exports.logout = async (req, res, next) => {
  try {
    const { deviceId } = req.body || {};
    if (deviceId) {
      await Session.findOneAndUpdate({ deviceId, user: req.user._id }, { isActive: false });
    }
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

// ─── Session Validation (app startup check) ──────────────────────────────────
// Returns { valid, user, needsBiometric, isReturningUser }
exports.checkSession = async (req, res, next) => {
  try {
    const { deviceId } = req.query;
    let needsBiometric = false;
    let sessionMeta    = {};

    if (deviceId) {
      const session = await Session.findOne({ deviceId, user: req.user._id, isActive: true })
        .select("biometricEnabled pinEnabled language timezone deviceName platform lastUsed expiresAt");

      if (session) {
        needsBiometric = !!session.biometricEnabled;
        sessionMeta = {
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

    const payload = userPayload(req.user);

    res.json({
      success:         true,
      valid:           true,
      user:            payload,
      needsBiometric,
      isReturningUser: payload.isReturningUser,
      session:         sessionMeta,
    });
  } catch (err) {
    next(err);
  }
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
      _id:            req.user._id,
      emailOTP:       hashed,
      emailOTPExpire: { $gt: Date.now() },
    }).select("+emailOTP +emailOTPExpire");

    if (!user) return res.status(400).json({ success: false, message: "Invalid or expired OTP" });

    user.isEmailVerified = true;
    user.emailOTP        = undefined;
    user.emailOTPExpire  = undefined;
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
      user.resetPasswordToken  = undefined;
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
      resetPasswordToken:  hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });
    if (!user) return res.status(400).json({ success: false, message: "Token is invalid or has expired" });

    user.password            = req.body.password;
    user.resetPasswordToken  = undefined;
    user.resetPasswordExpire = undefined;
    user.refreshToken        = null;
    await user.save();

    await Session.updateMany({ user: user._id }, { isActive: false });

    res.json({ success: true, message: "Password reset successful. Please log in." });
  } catch (err) {
    next(err);
  }
};

// ─── Social Login ─────────────────────────────────────────────────────────────
async function verifyGoogleToken(idToken) {
  const url  = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (!resp.ok || data.error) throw new Error(data.error_description || "Invalid Google token");
  if (data.email_verified !== "true" && data.email_verified !== true) {
    throw new Error("Google account email not verified");
  }
  return { socialId: data.sub, email: data.email, name: data.name || null, avatar: data.picture || null };
}

async function verifyAppleToken(idToken) {
  const [headerB64] = idToken.split(".");
  const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));

  const keysRes = await fetch("https://appleid.apple.com/auth/keys");
  const { keys } = await keysRes.json();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("Apple signing key not found");

  const { createPublicKey, createVerify } = require("crypto");
  const pubKey = createPublicKey({ key: jwk, format: "jwk" });

  const [, payloadB64, signatureB64] = idToken.split(".");
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature    = Buffer.from(signatureB64, "base64url");

  const verifier = createVerify("SHA256");
  verifier.update(signingInput);
  if (!verifier.verify(pubKey, signature)) throw new Error("Invalid Apple token signature");

  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Apple token expired");

  return { socialId: payload.sub, email: payload.email || null, name: null, avatar: null };
}

exports.socialLogin = async (req, res, next) => {
  try {
    const { provider, idToken } = req.body;

    if (!["google", "apple"].includes(provider)) {
      return res.status(400).json({ success: false, message: "Unsupported provider" });
    }
    if (!idToken) {
      return res.status(400).json({ success: false, message: "idToken is required" });
    }

    let verified;
    try {
      verified = provider === "google"
        ? await verifyGoogleToken(idToken)
        : await verifyAppleToken(idToken);
    } catch (err) {
      return res.status(401).json({ success: false, message: `Token verification failed: ${err.message}` });
    }

    const { socialId, email, name, avatar } = verified;

    let user = await User.findOne({
      $or: [{ socialId, socialProvider: provider }, ...(email ? [{ email }] : [])],
    }).select("+loginCount");

    if (user) {
      if (!user.socialId) {
        user.socialId       = socialId;
        user.socialProvider = provider;
        if (avatar && !user.avatar) user.avatar = avatar;
        await user.save({ validateBeforeSave: false });
      }
    } else {
      if (!email) {
        return res.status(400).json({ success: false, message: "Email is required to create an account" });
      }
      user = await User.create({
        name: name || email.split("@")[0],
        email,
        socialId,
        socialProvider: provider,
        avatar,
        isEmailVerified: true,
      });
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

    if (!(await user.matchPassword(currentPassword))) {
      return res.status(401).json({ success: false, message: "Current password is incorrect" });
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    next(err);
  }
};
