const express = require("express");
const router = express.Router();
const {
  getNotifications, getUnreadCount, markAsRead, markAllAsRead,
  deleteNotification, clearAllNotifications, sendNotification,
} = require("../controllers/notification.controller");
const { protect } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/role.middleware");

router.use(protect);

router.get("/count", getUnreadCount);   // lightweight badge count
router.get("/", getNotifications);
router.patch("/read-all", markAllAsRead);
router.delete("/", clearAllNotifications);
router.patch("/:id/read", markAsRead);
router.delete("/:id", deleteNotification);

// Admin: send broadcast notification
router.post("/send", authorize("admin"), sendNotification);

module.exports = router;
