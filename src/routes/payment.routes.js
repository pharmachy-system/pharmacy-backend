const express = require("express");
const router  = express.Router();
const {
  createPaymentIntent,
  stripeWebhook,
  getPaymentHistory,
  verifyPayment,
  requestRefund,
  adminGetAllPayments,
  adminUpdatePaymentStatus,
} = require("../controllers/payment.controller");
const { protect }       = require("../middlewares/auth.middleware");
const authorize         = require("../middlewares/role.middleware");
const { paymentLimiter } = require("../middlewares/rateLimiter");

// Stripe webhook — must receive raw body for signature verification
router.post("/webhook", express.raw({ type: "application/json" }), stripeWebhook);

router.use(protect);

// ── Customer routes ───────────────────────────────────────────────────────────
router.post("/create-intent", paymentLimiter, createPaymentIntent);
router.get("/history",        getPaymentHistory);
router.get("/:orderId/verify", verifyPayment);
router.post("/refund",        paymentLimiter, requestRefund);

// ── Admin routes ──────────────────────────────────────────────────────────────
router.get("/admin/all",           authorize("admin"), adminGetAllPayments);
router.patch("/admin/:id/status",  authorize("admin"), adminUpdatePaymentStatus);

module.exports = router;
