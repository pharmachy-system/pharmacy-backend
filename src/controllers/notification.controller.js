const Notification = require("../models/Notification.model");

// Lightweight badge-count endpoint — single DB call, no pagination overhead
exports.getUnreadCount = async (req, res, next) => {
  try {
    const count = await Notification.countDocuments({ user: req.user._id, isRead: false });
    res.json({ success: true, count });
  } catch (err) {
    next(err);
  }
};

exports.getNotifications = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };
    if (typeof req.query.type === "string") filter.type = req.query.type;
    if (req.query.unread === "true") filter.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ user: req.user._id, isRead: false }),
    ]);

    res.json({
      success: true,
      notifications,
      unreadCount,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.markAsRead = async (req, res, next) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isRead: true, readAt: new Date() }
    );
    res.json({ success: true, message: "Notification marked as read" });
  } catch (err) {
    next(err);
  }
};

exports.markAllAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    res.json({ success: true, message: "All notifications marked as read" });
  } catch (err) {
    next(err);
  }
};

exports.deleteNotification = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });
    res.json({ success: true, message: "Notification deleted" });
  } catch (err) {
    next(err);
  }
};

exports.clearAllNotifications = async (req, res, next) => {
  try {
    await Notification.deleteMany({ user: req.user._id });
    res.json({ success: true, message: "All notifications cleared" });
  } catch (err) {
    next(err);
  }
};

// Admin: send notification to specified users or broadcast to all active users in batches
exports.sendNotification = async (req, res, next) => {
  try {
    const { userIds, type, title, body, data, channels } = req.body;
    const { bulkNotify } = require("../utils/notification.util");
    const BATCH = 500;

    if (userIds && userIds.length > 0) {
      // Send to specified list — chunk to avoid oversized insertMany
      for (let i = 0; i < userIds.length; i += BATCH) {
        await bulkNotify(userIds.slice(i, i + BATCH), { type, title, body, data, channels });
      }
    } else {
      // Broadcast to all active users — cursor to avoid loading all into memory
      const User = require("../models/User.model");
      const cursor = User.find({ isActive: true }).select("_id").lean().cursor();
      let batch = [];
      for await (const user of cursor) {
        batch.push(user._id);
        if (batch.length >= BATCH) {
          await bulkNotify(batch, { type, title, body, data, channels });
          batch = [];
        }
      }
      if (batch.length) await bulkNotify(batch, { type, title, body, data, channels });
    }

    res.json({ success: true, message: "Notification sent" });
  } catch (err) {
    next(err);
  }
};
