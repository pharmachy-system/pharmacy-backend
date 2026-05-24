/**
 * Firebase Cloud Messaging (FCM) Push Notifications
 *
 * Setup:
 *   1. Create a Firebase project at https://console.firebase.google.com
 *   2. Go to Project Settings → Service Accounts → Generate new private key
 *   3. Set FIREBASE_SERVICE_ACCOUNT env var to the JSON string (or file path)
 *   4. npm install firebase-admin
 *
 * When FIREBASE_SERVICE_ACCOUNT is not set → logs to console (dev mode).
 * In production without config → throws an error.
 */

const logger = require("../config/logger.config");

// ─── Lazy Firebase init ───────────────────────────────────────────────────────
let _firebaseApp = null;

const getFirebaseAdmin = () => {
  if (_firebaseApp) return _firebaseApp;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;

  try {
    const admin = require("firebase-admin"); // must be installed
    if (admin.apps.length) {
      _firebaseApp = admin;
      return _firebaseApp;
    }

    let serviceAccount;
    if (raw.startsWith("{")) {
      serviceAccount = JSON.parse(raw);
    } else {
      // treat as file path
      serviceAccount = require(raw); // eslint-disable-line
    }

    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    _firebaseApp = admin;
    logger.info("Firebase Admin SDK initialized ✓");
    return _firebaseApp;
  } catch (err) {
    logger.error("Firebase Admin SDK init failed:", err.message);
    return null;
  }
};

// ─── Send to a single FCM token ───────────────────────────────────────────────
/**
 * @param {string}  fcmToken    Device FCM registration token
 * @param {object}  notification
 * @param {string}  notification.title
 * @param {string}  notification.body
 * @param {object}  [notification.imageUrl]
 * @param {object}  [data]      Key-value string payload for the app
 * @returns {Promise<string|null>} messageId on success, null on skip
 */
const sendPush = async (fcmToken, { title, body, imageUrl }, data = {}) => {
  if (!fcmToken) return null;

  const admin = getFirebaseAdmin();

  if (!admin) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Firebase not configured — set FIREBASE_SERVICE_ACCOUNT and install firebase-admin");
    }
    logger.info(`🔔 [PUSH DEV] To: ${fcmToken.slice(0, 12)}… | ${title}: ${body}`);
    return "dev_mock_message_id";
  }

  const message = {
    token: fcmToken,
    notification: {
      title,
      body,
      ...(imageUrl && { imageUrl }),
    },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ),
    android: {
      priority: "high",
      notification: { sound: "default", channelId: "pharmacy_default" },
    },
    apns: {
      payload: { aps: { sound: "default", badge: 1 } },
    },
  };

  try {
    const messageId = await admin.messaging().send(message);
    return messageId;
  } catch (err) {
    // Token no longer valid — caller should deactivate it
    if (err.code === "messaging/registration-token-not-registered") {
      logger.warn(`FCM token invalid — should be removed: ${fcmToken.slice(0, 12)}…`);
      return null;
    }
    throw err;
  }
};

// ─── Send to multiple tokens (multicast) ─────────────────────────────────────
/**
 * @param {string[]} fcmTokens
 * @param {object}   notification  { title, body, imageUrl }
 * @param {object}   [data]
 * @returns {Promise<{ successCount, failureCount, failedTokens }>}
 */
const sendMulticastPush = async (fcmTokens, notification, data = {}) => {
  const tokens = fcmTokens.filter(Boolean);
  if (!tokens.length) return { successCount: 0, failureCount: 0, failedTokens: [] };

  const admin = getFirebaseAdmin();

  if (!admin) {
    logger.info(`🔔 [PUSH DEV] Multicast to ${tokens.length} device(s): ${notification.title}`);
    return { successCount: tokens.length, failureCount: 0, failedTokens: [] };
  }

  const message = {
    tokens,
    notification,
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ),
    android: { priority: "high", notification: { sound: "default" } },
    apns:    { payload: { aps: { sound: "default", badge: 1 } } },
  };

  const response = await admin.messaging().sendEachForMulticast(message);
  const failedTokens = [];

  response.responses.forEach((resp, i) => {
    if (!resp.success && resp.error?.code === "messaging/registration-token-not-registered") {
      failedTokens.push(tokens[i]);
    }
  });

  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
    failedTokens,
  };
};

// ─── Send to a topic ──────────────────────────────────────────────────────────
/**
 * Publish to an FCM topic (e.g. "promotions", "all_users").
 * Devices must be subscribed via firebase SDK on the client.
 */
const sendTopicPush = async (topic, { title, body, imageUrl }, data = {}) => {
  const admin = getFirebaseAdmin();

  if (!admin) {
    logger.info(`🔔 [PUSH DEV] Topic "${topic}": ${title}`);
    return;
  }

  await admin.messaging().send({
    topic,
    notification: { title, body, ...(imageUrl && { imageUrl }) },
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
  });
};

module.exports = { sendPush, sendMulticastPush, sendTopicPush };
