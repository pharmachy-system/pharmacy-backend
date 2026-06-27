/**
 * Utils barrel export.
 * Import any utility from one place:
 *   const { AppError, sendEmail, sendPush } = require("../utils");
 */

// Error class
const AppError       = require("./AppError");

// Auth helpers
const tokenUtil      = require("./token.util");
const sessionUtil    = require("./session.util");

// Messaging
const sendEmail      = require("./email.util");
const emailTemplates = require("./email.templates");
const sendSMS        = require("./sms.util");
const pushUtil       = require("./push.util");

// Notifications
const notificationUtil = require("./notification.util");

// File uploads
const cloudinaryUtil = require("./cloudinary.util");

module.exports = {
  // Error handling
  AppError,

  // Token generation
  generateAccessToken:  tokenUtil.generateAccessToken,
  generateRefreshToken: tokenUtil.generateRefreshToken,

  // Session management
  extractDeviceInfo: sessionUtil.extractDeviceInfo,
  upsertSession:     sessionUtil.upsertSession,

  // Email
  sendEmail,
  emailTemplates,
  sendWelcomeEmail:            sendEmail.sendWelcomeEmail,
  sendPasswordResetEmail:      sendEmail.sendPasswordResetEmail,
  sendOrderConfirmationEmail:  sendEmail.sendOrderConfirmationEmail,
  sendOtpEmail:                sendEmail.sendOtpEmail,
  sendOrderStatusEmail:        sendEmail.sendOrderStatusEmail,
  sendLowStockAlert:           sendEmail.sendLowStockAlert,

  // SMS
  sendSMS,

  // Push notifications
  sendPush:           pushUtil.sendPush,
  sendMulticastPush:  pushUtil.sendMulticastPush,
  sendTopicPush:      pushUtil.sendTopicPush,

  // In-app notifications
  createNotification: notificationUtil.createNotification,
  bulkNotify:         notificationUtil.bulkNotify,
  broadcastPush:      notificationUtil.broadcastPush,

  // Cloudinary
  uploadToCloudinary: cloudinaryUtil.uploadToCloudinary,
  deleteFromCloudinary: cloudinaryUtil.deleteFromCloudinary,
};
