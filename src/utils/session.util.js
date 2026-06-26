const Session = require("../models/Session.model");
const User    = require("../models/User.model");

const REMEMBER_DEVICE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Extract device info from request body + headers.
 * Priority: body field > custom header > fallback.
 */
const extractDeviceInfo = (req) => {
  const lang = req.body.language
    || req.headers["x-device-language"]
    || req.headers["accept-language"]?.split(",")[0]?.split("-")[0]
    || "ar";

  const locale = req.body.deviceLocale
    || req.headers["x-device-locale"]
    || req.headers["accept-language"]?.split(",")[0]?.trim()
    || "";

  return {
    deviceId:       req.body.deviceId       || req.headers["x-device-id"]       || `web_${Date.now()}`,
    deviceName:     req.body.deviceName     || req.headers["x-device-name"]     || "Unknown Device",
    deviceType:     req.body.deviceType     || "web",
    deviceOS:       req.body.deviceOS       || req.headers["x-device-os"]       || "",
    platform:       req.body.platform       || req.headers["x-platform"]        || "web",
    appVersion:     req.body.appVersion     || req.headers["x-app-version"]     || "",
    fcmToken:       req.body.fcmToken       || "",
    language:       lang,
    deviceLanguage: req.body.deviceLanguage || lang,
    deviceLocale:   locale,
    timezone:       req.body.timezone       || "Asia/Riyadh",
  };
};

/**
 * Create or update a session record for a device login.
 * Pass rememberDevice=true to extend session to 30 days (default: 7 days).
 * Also updates User.deviceInfo for the device.
 */
const upsertSession = async (userId, refreshToken, deviceInfo, req, { rememberDevice = false } = {}) => {
  const now       = new Date();
  const expiryMs  = rememberDevice ? REMEMBER_DEVICE_EXPIRY_MS : Session.SESSION_EXPIRY_MS;
  const expiresAt = new Date(now.getTime() + expiryMs);

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
    deviceLanguage:    deviceInfo.deviceLanguage,
    deviceLocale:      deviceInfo.deviceLocale,
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

  // Keep User.deviceInfo in sync (upsert by deviceId)
  await User.findByIdAndUpdate(userId, {
    $pull: { deviceInfo: { deviceId: deviceInfo.deviceId } },
  });
  await User.findByIdAndUpdate(userId, {
    $push: {
      deviceInfo: {
        $each: [{
          deviceId:       deviceInfo.deviceId,
          deviceLocale:   deviceInfo.deviceLocale,
          deviceLanguage: deviceInfo.deviceLanguage,
          platform:       deviceInfo.platform,
          lastSeen:       now,
        }],
        $slice: -10, // keep last 10 devices
      },
    },
  });
};

module.exports = { extractDeviceInfo, upsertSession };
