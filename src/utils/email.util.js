const nodemailer = require("nodemailer");
const templates  = require("./email.templates");
const logger     = require("../config/logger.config");

// ─── Lazy transporter (created once, reused) ──────────────────────────────────
let _transporter = null;

const getTransporter = () => {
  if (_transporter) return _transporter;

  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
    return null; // dev fallback — will console.log instead
  }

  _transporter = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST,
    port:   parseInt(process.env.EMAIL_PORT, 10) || 587,
    secure: process.env.EMAIL_PORT === "465",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  return _transporter;
};

// ─── Core send function ───────────────────────────────────────────────────────
const sendEmail = async ({ to, subject, html, text }) => {
  const transporter = getTransporter();

  if (!transporter) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Email service not configured — set EMAIL_HOST, EMAIL_USER, EMAIL_PASS");
    }
    logger.info(`📧 [EMAIL DEV] To: ${to} | Subject: ${subject}`);
    return;
  }

  await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME || process.env.APP_NAME || "Pharmacy"}" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
    text: text || subject,
  });
};

// ─── Template shortcuts ───────────────────────────────────────────────────────

/** Welcome email — sent after registration */
const sendWelcomeEmail = async (user, verificationLink = null) => {
  try {
    await sendEmail({
      to:      user.email,
      subject: `مرحباً بك في صيدليتنا | Welcome to Our Pharmacy`,
      html:    templates.welcomeEmail({ name: user.name, verificationLink }),
    });
  } catch (err) {
    logger.error("sendWelcomeEmail failed:", err.message);
  }
};

/** Password reset email */
const sendPasswordResetEmail = async (user, resetLink, expiresInMinutes = 10) => {
  try {
    await sendEmail({
      to:      user.email,
      subject: "إعادة تعيين كلمة المرور | Password Reset",
      html:    templates.passwordResetEmail({ name: user.name, resetLink, expiresInMinutes }),
    });
  } catch (err) {
    logger.error("sendPasswordResetEmail failed:", err.message);
  }
};

/** Order confirmation email */
const sendOrderConfirmationEmail = async (user, order) => {
  try {
    await sendEmail({
      to:      user.email,
      subject: `تأكيد الطلب #${order.orderNumber || order._id} | Order Confirmed`,
      html:    templates.orderConfirmationEmail({ name: user.name, order }),
    });
  } catch (err) {
    logger.error("sendOrderConfirmationEmail failed:", err.message);
  }
};

/** OTP / email verification code */
const sendOtpEmail = async (user, otp, purpose, expiresInMinutes = 5) => {
  try {
    await sendEmail({
      to:      user.email,
      subject: "رمز التحقق | Verification Code",
      html:    templates.otpEmail({ name: user.name, otp, purpose, expiresInMinutes }),
    });
  } catch (err) {
    logger.error("sendOtpEmail failed:", err.message);
  }
};

/** Order status update email */
const sendOrderStatusEmail = async (user, order, newStatus) => {
  try {
    await sendEmail({
      to:      user.email,
      subject: `تحديث طلبك #${order.orderNumber || order._id} | Order Update`,
      html:    templates.orderStatusEmail({ name: user.name, order, newStatus }),
    });
  } catch (err) {
    logger.error("sendOrderStatusEmail failed:", err.message);
  }
};

/** Low stock alert to admin */
const sendLowStockAlert = async (adminEmail, items) => {
  try {
    await sendEmail({
      to:      adminEmail,
      subject: "⚠️ تنبيه مخزون منخفض | Low Stock Alert",
      html:    templates.lowStockAlertEmail({ items }),
    });
  } catch (err) {
    logger.error("sendLowStockAlert failed:", err.message);
  }
};

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = sendEmail;

// Named exports for convenience
module.exports.sendEmail               = sendEmail;
module.exports.sendWelcomeEmail        = sendWelcomeEmail;
module.exports.sendPasswordResetEmail  = sendPasswordResetEmail;
module.exports.sendOrderConfirmationEmail = sendOrderConfirmationEmail;
module.exports.sendOtpEmail            = sendOtpEmail;
module.exports.sendOrderStatusEmail    = sendOrderStatusEmail;
module.exports.sendLowStockAlert       = sendLowStockAlert;
