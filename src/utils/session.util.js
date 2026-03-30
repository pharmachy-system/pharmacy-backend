const Session = require("../models/Session.model");

/**
 * Extract device info from request body + headers.
 * Clients should send device fields in the request body.
 */
const extractDeviceInfo = (req) => ({
  deviceId:   req.body.deviceId   || `web_${Date.now()}`,
  deviceName: req.body.deviceName || req.headers["x-device-name"] || "Unknown Device",
  deviceType: req.body.deviceType || "web",
  deviceOS:   req.body.deviceOS   || req.headers["x-device-os"]   || "",
  platform:   req.body.platform   || req.headers["x-platform"]    || "web",
  appVersion: req.body.appVersion || req.headers["x-app-version"] || "",
  fcmToken:   req.body.fcmToken   || "",
  language:   req.body.language   || req.headers["accept-language"]?.split(",")[0]?.split("-")[0] || "ar",
  timezone:   req.body.timezone   || "Asia/Riyadh",
});

/**
 * Create or update a session record for a device login.
 * Uses upsert so re-logging-in from the same device refreshes the session.
 */
const upsertSession = async (userId, refreshToken, deviceInfo, req) => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Session.SESSION_EXPIRY_MS);

  const sessionData = {
    user:              userId,
    refreshTokenHash:  Session.hashToken(refreshToken),
    deviceName:        deviceInfo.deviceName,
    deviceType:        deviceInfo.deviceType,
    deviceOS:          deviceInfo.deviceOS,
    platform:          deviceInfo.platform,
    appVersion:        deviceInfo.appVersion,
    fcmToken:          deviceInfo.fcmToken,
    language:          deviceInfo.language,
    timezone:          deviceInfo.timezone,
    ipAddress:         req?.ip || "",
    userAgent:         req?.headers?.["user-agent"] || "",
    lastUsed:          now,
    expiresAt,
    isActive:          true,
  };

  await Session.findOneAndUpdate(
    { deviceId: deviceInfo.deviceId },
    { $set: sessionData, $setOnInsert: { deviceId: deviceInfo.deviceId } },
    { upsert: true, new: true }
  );
};

module.exports = { extractDeviceInfo, upsertSession };
