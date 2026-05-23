/**
 * Biometric Authentication Controller
 *
 * Flow:
 *   1. User logs in normally (email/phone/social) on device.
 *   2. Device asks to enable biometrics → POST /api/auth/biometric/enable
 *      Server generates a biometricToken, stores its SHA-256 hash in the Session.
 *      Returns the plain token — app stores it in iOS Keychain / Android Keystore
 *      (locked behind Face ID / Fingerprint).
 *   3. On next app launch, device hardware unlocks the keychain/keystore.
 *      App retrieves the biometricToken and sends it to:
 *      POST /api/auth/biometric/verify
 *      Server verifies the hash → issues new access + refresh tokens.
 *   4. If biometric fails (3 attempts), fall through to PIN / password.
 *
 * The server never touches the device biometric sensor directly.
 * Security comes from: (a) the biometricToken is only accessible after
 * successful device biometric, and (b) it rotates on every successful verify.
 */

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const Session = require("../../models/Session.model");
const { generateAccessToken, generateRefreshToken } = require("../../utils/token.util");
const { upsertSession } = require("../../utils/session.util");
const User = require("../../models/User.model");

const BIOMETRIC_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_BIOMETRIC_FAILURES = 3;

// ─── Enable biometric for the current device ──────────────────────────────────
// Requires authenticated session (user just logged in).
exports.enableBiometric = async (req, res, next) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) {
      return res.status(400).json({ success: false, message: "deviceId is required" });
    }

    const session = await Session.findOne({ deviceId, user: req.user._id, isActive: true });
    if (!session) {
      return res.status(404).json({ success: false, message: "No active session found for this device" });
    }

    // Generate a random biometric token
    const biometricToken = crypto.randomBytes(32).toString("hex");
    session.biometricEnabled    = true;
    session.biometricTokenHash  = Session.hashToken(biometricToken);
    session.biometricTokenExpiry = new Date(Date.now() + BIOMETRIC_TOKEN_EXPIRY_MS);
    await session.save();

    res.json({
      success: true,
      message: "Biometric authentication enabled",
      biometricToken, // store securely in device keychain/keystore
      expiresAt: session.biometricTokenExpiry,
    });
  } catch (err) {
    next(err);
  }
};

// ─── Verify biometric → issue tokens ─────────────────────────────────────────
// Called by app after successful device biometric unlock.
exports.verifyBiometric = async (req, res, next) => {
  try {
    const { deviceId, biometricToken } = req.body;
    if (!deviceId || !biometricToken) {
      return res.status(400).json({ success: false, message: "deviceId and biometricToken are required" });
    }

    const session = await Session.findOne({ deviceId, isActive: true })
      .select("+biometricTokenHash +refreshTokenHash");

    if (!session || !session.biometricEnabled) {
      return res.status(404).json({ success: false, message: "Biometric not enabled for this device" });
    }

    if (!session.biometricTokenExpiry || session.biometricTokenExpiry < new Date()) {
      return res.status(401).json({
        success: false,
        message: "Biometric token expired. Please log in with your password.",
        fallback: "password",
      });
    }

    const incomingHash = Session.hashToken(biometricToken);
    if (session.biometricTokenHash !== incomingHash) {
      return res.status(401).json({
        success: false,
        message: "Biometric verification failed",
        fallback: "pin",
      });
    }

    const user = await User.findById(session.user);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: "User not found or deactivated" });
    }

    // Issue new tokens
    const { generateAccessToken, generateRefreshToken } = require("../../utils/token.util");
    const accessToken  = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Rotate biometric token
    const newBiometricToken = crypto.randomBytes(32).toString("hex");
    session.biometricTokenHash   = Session.hashToken(newBiometricToken);
    session.biometricTokenExpiry = new Date(Date.now() + BIOMETRIC_TOKEN_EXPIRY_MS);
    session.refreshTokenHash     = Session.hashToken(refreshToken);
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
      biometricToken: newBiometricToken, // device must update its stored token
      user: {
        id:    user._id,
        name:  user.name,
        email: user.email,
        role:  user.role,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Disable biometric ────────────────────────────────────────────────────────
exports.disableBiometric = async (req, res, next) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) {
      return res.status(400).json({ success: false, message: "deviceId is required" });
    }

    const session = await Session.findOneAndUpdate(
      { deviceId, user: req.user._id, isActive: true },
      { $set: { biometricEnabled: false, biometricTokenHash: null, biometricTokenExpiry: null } },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ success: false, message: "No active session found for this device" });
    }

    res.json({ success: true, message: "Biometric authentication disabled" });
  } catch (err) {
    next(err);
  }
};
