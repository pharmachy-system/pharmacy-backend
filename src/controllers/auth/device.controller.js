/**
 * Device Management Controller
 *
 * Endpoints:
 *   GET    /api/user/devices              → list all active sessions/devices
 *   GET    /api/user/devices/current      → get current device session
 *   PUT    /api/user/devices/:deviceId    → update device preferences (language, timezone, fcmToken)
 *   DELETE /api/user/devices/:deviceId    → revoke a specific device session
 *   DELETE /api/user/devices              → revoke ALL device sessions (logout everywhere)
 */

const Session = require("../../models/Session.model");

// ─── List all devices ─────────────────────────────────────────────────────────
exports.getDevices = async (req, res, next) => {
  try {
    const sessions = await Session.find({ user: req.user._id, isActive: true })
      .select("-refreshTokenHash -biometricTokenHash -pinHash")
      .sort({ lastUsed: -1 });

    res.json({
      success: true,
      count: sessions.length,
      devices: sessions.map((s) => ({
        deviceId:          s.deviceId,
        deviceName:        s.deviceName,
        deviceType:        s.deviceType,
        deviceOS:          s.deviceOS,
        platform:          s.platform,
        appVersion:        s.appVersion,
        language:          s.language,
        timezone:          s.timezone,
        biometricEnabled:  s.biometricEnabled,
        pinEnabled:        s.pinEnabled,
        lastUsed:          s.lastUsed,
        createdAt:         s.createdAt,
        expiresAt:         s.expiresAt,
        isCurrent:         s.deviceId === (req.body.deviceId || req.headers["x-device-id"]),
      })),
    });
  } catch (err) {
    next(err);
  }
};

// ─── Get current device ───────────────────────────────────────────────────────
exports.getCurrentDevice = async (req, res, next) => {
  try {
    const deviceId = req.body.deviceId || req.headers["x-device-id"];
    if (!deviceId) {
      return res.status(400).json({ success: false, message: "deviceId is required (body or x-device-id header)" });
    }

    const session = await Session.findOne({ user: req.user._id, deviceId, isActive: true })
      .select("-refreshTokenHash -biometricTokenHash -pinHash");

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found for this device" });
    }

    res.json({ success: true, device: session });
  } catch (err) {
    next(err);
  }
};

// ─── Update device preferences ────────────────────────────────────────────────
exports.updateDevice = async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { language, timezone, fcmToken, deviceName, appVersion } = req.body;

    const allowed = {};
    if (language)    allowed.language    = language;
    if (timezone)    allowed.timezone    = timezone;
    if (fcmToken)    allowed.fcmToken    = fcmToken;
    if (deviceName)  allowed.deviceName  = deviceName;
    if (appVersion)  allowed.appVersion  = appVersion;

    if (Object.keys(allowed).length === 0) {
      return res.status(400).json({ success: false, message: "No updatable fields provided" });
    }

    const session = await Session.findOneAndUpdate(
      { user: req.user._id, deviceId, isActive: true },
      { $set: allowed },
      { new: true }
    ).select("-refreshTokenHash -biometricTokenHash -pinHash");

    if (!session) {
      return res.status(404).json({ success: false, message: "Device session not found" });
    }

    res.json({ success: true, message: "Device updated", device: session });
  } catch (err) {
    next(err);
  }
};

// ─── Revoke a specific device session ────────────────────────────────────────
exports.removeDevice = async (req, res, next) => {
  try {
    const { deviceId } = req.params;

    const session = await Session.findOneAndUpdate(
      { user: req.user._id, deviceId, isActive: true },
      { $set: { isActive: false } },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ success: false, message: "Device session not found" });
    }

    res.json({ success: true, message: "Device session revoked" });
  } catch (err) {
    next(err);
  }
};

// ─── Revoke ALL device sessions ───────────────────────────────────────────────
exports.removeAllDevices = async (req, res, next) => {
  try {
    const result = await Session.updateMany(
      { user: req.user._id, isActive: true },
      { $set: { isActive: false } }
    );

    res.json({
      success: true,
      message: "All device sessions revoked",
      revokedCount: result.modifiedCount,
    });
  } catch (err) {
    next(err);
  }
};
