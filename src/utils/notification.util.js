const Notification = require("../models/Notification.model");
const Session      = require("../models/Session.model");
const logger       = require("../config/logger.config");
const { sendPush, sendMulticastPush } = require("./push.util");
const sendSMS      = require("./sms.util");

/**
 * Create a DB notification and dispatch it through the requested channels.
 *
 * @param {object}   opts
 * @param {string}   opts.userId
 * @param {string}   opts.type       order|prescription|promotion|reminder|system|delivery
 * @param {string}   opts.title      Notification title (shown in push banner)
 * @param {string}   opts.body       Notification body text
 * @param {object}   [opts.data]     Arbitrary key-value payload for the app
 * @param {string[]} [opts.channels] push | email | sms   (email handled outside this util)
 * @param {string}   [opts.phone]    Required when channels includes "sms"
 */
exports.createNotification = async ({
  userId,
  type,
  title,
  body,
  data     = {},
  channels = ["push"],
  phone    = null,
}) => {
  try {
    // ── 1. Persist to DB ───────────────────────────────────────────────────────
    const notification = await Notification.create({
      user: userId, type, title, body, data, channels,
    });

    // ── 2. Push notification (FCM) ─────────────────────────────────────────────
    if (channels.includes("push")) {
      try {
        // Collect all active FCM tokens for this user across devices
        const sessions = await Session.find({
          user:     userId,
          isActive: true,
          fcmToken: { $exists: true, $ne: null },
        }).select("fcmToken").lean();

        const tokens = sessions.map((s) => s.fcmToken).filter(Boolean);

        if (tokens.length > 0) {
          const { failedTokens } = await sendMulticastPush(
            tokens,
            { title, body },
            {
              notificationId: notification._id.toString(),
              type,
              ...Object.fromEntries(
                Object.entries(data).map(([k, v]) => [k, String(v)])
              ),
            }
          );

          // Deactivate sessions whose FCM token is no longer valid
          if (failedTokens.length > 0) {
            await Session.updateMany(
              { fcmToken: { $in: failedTokens } },
              { $unset: { fcmToken: 1 } }
            );
          }
        }
      } catch (pushErr) {
        logger.warn("Push notification failed (non-fatal):", pushErr.message);
      }
    }

    // ── 3. SMS ─────────────────────────────────────────────────────────────────
    if (channels.includes("sms") && phone) {
      try {
        await sendSMS({ to: phone, body: `${title}\n${body}` });
      } catch (smsErr) {
        logger.warn("SMS notification failed (non-fatal):", smsErr.message);
      }
    }

    return notification;
  } catch (err) {
    logger.error("createNotification error:", err);
  }
};

/**
 * Bulk-notify multiple users (e.g. flash sale broadcast, low-stock alert).
 * Only persists to DB + fires push; does NOT send SMS in bulk (cost control).
 *
 * @param {string[]} userIds
 * @param {object}   payload    { type, title, body, data, channels }
 */
exports.bulkNotify = async (userIds, payload) => {
  try {
    const docs = userIds.map((userId) => ({ user: userId, ...payload }));
    await Notification.insertMany(docs, { ordered: false });

    // Fire push for all affected users' devices
    if ((payload.channels || ["push"]).includes("push")) {
      const sessions = await Session.find({
        user:     { $in: userIds },
        isActive: true,
        fcmToken: { $exists: true, $ne: null },
      }).select("fcmToken").lean();

      const tokens = sessions.map((s) => s.fcmToken).filter(Boolean);
      if (tokens.length > 0) {
        await sendMulticastPush(tokens, {
          title: payload.title,
          body:  payload.body,
        }, { type: payload.type || "system" });
      }
    }
  } catch (err) {
    logger.error("bulkNotify error:", err);
  }
};

/**
 * Send a topic-based push to all subscribed devices (no DB record).
 * Useful for app-wide broadcasts (e.g. maintenance notice).
 *
 * @param {string} topic   FCM topic name (e.g. "promotions", "all_users")
 * @param {object} payload { title, body, data }
 */
exports.broadcastPush = async (topic, { title, body, data = {} }) => {
  try {
    const { sendTopicPush } = require("./push.util");
    await sendTopicPush(topic, { title, body }, data);
  } catch (err) {
    logger.warn("broadcastPush failed (non-fatal):", err.message);
  }
};
