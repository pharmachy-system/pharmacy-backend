const express = require("express");
const router = express.Router();
const {
  createPaymentIntent, stripeWebhook, getPaymentHistory, requestRefund,
} = require("../controllers/payment.controller");
const { protect } = require("../middlewares/auth.middleware");

// Stripe webhook uses raw body – must be before express.json()
// Note: in app.js, add this route before body parsing middleware
// or handle raw body parsing here.
router.post("/webhook", express.raw({ type: "application/json" }), stripeWebhook);

router.use(protect);
router.post("/create-intent", createPaymentIntent);
router.get("/history", getPaymentHistory);
router.post("/refund", requestRefund);

module.exports = router;
