/**
 * PIN Controller — fallback authentication when biometrics fail.
 *
 * PIN is stored as a bcrypt hash per session (device-specific).
 * After 5 wrong attempts, PIN is locked for 15 minutes.
 * After 3 consecutive lockouts, session is fully deactivated (force re-login).
 */

const bcrypt = require("bcryptjs");
const Session = require("../models/Session.model");
const User = require("../models/User.model");
const { generateAccessToken, generateRefreshToken } = require("../utils/token.util");

const PIN_LOCK_ATTEMPTS  = 5;
const PIN_LOCKOUT_MS     = 15 * 60 * 1000; // 15 minutes

// ─── Set PIN for device (authenticated) ──────────────────────────────────────
exports.setPin = async (req, res, next) => {
  try {
    const { deviceId, pin } = req.body;

    if (!deviceId) return res.status(400).json({ success: false, message: "deviceId is required" });
    if (!pin || pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
      return res.status(400).json({ success: false, message: "PIN must be 4-8 digits" });
    }

    const session = await Session.findOne({ deviceId, user: req.user._id, isActive: true });
    if (!session) {
      return res.status(404).json({ success: false, message: "No active session found for this device" });
    }

    session.pinHash           = await bcrypt.hash(pin, 10);
    session.pinEnabled        = true;
    session.pinFailedAttempts = 0;
    session.pinLockedUntil    = undefined;
    await session.save();

    res.json({ success: true, message: "PIN set successfully" });
  } catch (err) {
    next(err);
  }
};

// ─── Verify PIN → issue tokens ────────────────────────────────────────────────
exports.verifyPin = async (req, res, next) => {
  try {
    const { deviceId, pin } = req.body;

    if (!deviceId || !pin) {
      return res.status(400).json({ success: false, message: "deviceId and pin are required" });
    }

    const session = await Session.findOne({ deviceId, isActive: true })
      .select("+pinHash +refreshTokenHash");

    if (!session || !session.pinEnabled) {
      return res.status(404).json({ success: false, message: "PIN not set for this device" });
    }

    // Check lockout
    if (session.pinLockedUntil && session.pinLockedUntil > new Date()) {
      const mins = Math.ceil((session.pinLockedUntil - Date.now()) / 60000);
      return res.status(429).json({
        success: false,
        message: `PIN locked. Try again in ${mins} minute(s).`,
        lockedUntil: session.pinLockedUntil,
      });
    }

    const isMatch = await bcrypt.compare(String(pin), session.pinHash);
    if (!isMatch) {
      session.pinFailedAttempts = (session.pinFailedAttempts || 0) + 1;
      if (session.pinFailedAttempts >= PIN_LOCK_ATTEMPTS) {
        session.pinLockedUntil    = new Date(Date.now() + PIN_LOCKOUT_MS);
        session.pinFailedAttempts = 0;
      }
      await session.save();

      const remaining = PIN_LOCK_ATTEMPTS - session.pinFailedAttempts;
      return res.status(401).json({
        success: false,
        message: remaining > 0
          ? `Incorrect PIN. ${remaining} attempt(s) remaining.`
          : "PIN locked for 15 minutes.",
        fallback: session.pinFailedAttempts >= PIN_LOCK_ATTEMPTS ? "password" : "pin",
      });
    }

    const user = await User.findById(session.user);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: "User not found or deactivated" });
    }

    const accessToken  = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    session.refreshTokenHash  = Session.hashToken(refreshToken);
    session.pinFailedAttempts = 0;
    session.pinLockedUntil    = undefined;
    session.lastUsed  = new Date();
    session.expiresAt = new Date(Date.now() + Session.SESSION_EXPIRY_MS);
    await session.save();

    user.refreshToken = refreshToken;
    user.lastLogin    = new Date();
    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Remove PIN ───────────────────────────────────────────────────────────────
exports.removePin = async (req, res, next) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ success: false, message: "deviceId is required" });

    await Session.findOneAndUpdate(
      { deviceId, user: req.user._id, isActive: true },
      { $set: { pinEnabled: false, pinHash: null, pinFailedAttempts: 0, pinLockedUntil: null } }
    );

    res.json({ success: true, message: "PIN removed" });
  } catch (err) {
    next(err);
  }
};
