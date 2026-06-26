const express = require("express");
const router = express.Router();
const {
  createPaymentIntent, stripeWebhook, getPaymentHistory, requestRefund,
} = require("../controllers/payment.controller");
const { protect } = require("../middlewares/auth.middleware");
const { paymentLimiter } = require("../middlewares/rateLimiter");

// Stripe webhook — raw body required for signature verification
router.post("/webhook", express.raw({ type: "application/json" }), stripeWebhook);

router.use(protect);
router.post("/create-intent", paymentLimiter, createPaymentIntent);
router.get("/history", getPaymentHistory);
router.post("/refund", paymentLimiter, requestRefund);

module.exports = router;
