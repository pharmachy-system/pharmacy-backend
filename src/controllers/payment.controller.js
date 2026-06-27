const Payment = require("../models/Payment.model");
const Order   = require("../models/Order.model");
const Wallet  = require("../models/Wallet.model");
const User    = require("../models/User.model");
const { createNotification }         = require("../utils/notification.util");
const { sendOrderConfirmationEmail } = require("../utils/email.util");
const logger = require("../config/logger.config");

// Lazy-init Stripe so missing key at startup doesn't crash the app
const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not configured");
  return require("stripe")(process.env.STRIPE_SECRET_KEY);
};

// ─── Create Payment Intent (Stripe / electronic) ──────────────────────────────
exports.createPaymentIntent = async (req, res, next) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, message: "orderId is required" });

    const order = await Order.findOne({ _id: orderId, user: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (order.paymentStatus === "paid") {
      return res.status(400).json({ success: false, message: "Order already paid" });
    }
    if (order.paymentMethod !== "card") {
      return res.status(400).json({ success: false, message: "Order is not set for card payment" });
    }

    const amountInHalalas = Math.round(order.total * 100);

    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount:      amountInHalalas,
      currency:    "sar",
      metadata:    { orderId: order._id.toString(), userId: req.user._id.toString(), orderNumber: order.orderNumber },
      description: `Order ${order.orderNumber}`,
    });

    // Upsert payment record (avoid duplicate if intent was already created)
    await Payment.findOneAndUpdate(
      { order: order._id, method: "card" },
      { $setOnInsert: {
          user:                  req.user._id,
          method:                "card",
          amount:                order.total,
          stripePaymentIntentId: paymentIntent.id,
          status:                "pending",
        } },
      { upsert: true, new: true }
    );

    res.json({ success: true, clientSecret: paymentIntent.client_secret });
  } catch (err) {
    next(err);
  }
};

// ─── Stripe Webhook ───────────────────────────────────────────────────────────
exports.stripeWebhook = async (req, res, next) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.rawBody || req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ success: false, message: `Webhook error: ${err.message}` });
  }

  try {
    switch (event.type) {

      case "payment_intent.succeeded": {
        const pi = event.data.object;
        const { orderId } = pi.metadata;

        const order = await Order.findByIdAndUpdate(
          orderId,
          {
            paymentStatus: "paid",
            status:        "confirmed",
            $push: { trackingHistory: { status: "confirmed", note: "Payment received via Stripe" } },
          },
          { new: true }
        );
        await Payment.findOneAndUpdate(
          { stripePaymentIntentId: pi.id },
          { status: "completed", stripeChargeId: pi.latest_charge, paidAt: new Date() }
        );

        if (order) {
          const user = await User.findById(order.user).select("name email");
          if (user) {
            createNotification({
              userId: user._id,
              type:   "order",
              title:  "Payment Confirmed",
              body:   `Payment for order ${order.orderNumber} was successful`,
              data:   { orderId: order._id, orderNumber: order.orderNumber },
            }).catch(() => {});
            sendOrderConfirmationEmail(user, order).catch(() => {});
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        await Payment.findOneAndUpdate({ stripePaymentIntentId: pi.id }, { status: "failed" });
        const failedPayment = await Payment.findOne({ stripePaymentIntentId: pi.id });
        if (failedPayment) {
          const order = await Order.findById(failedPayment.order);
          if (order) {
            createNotification({
              userId: order.user,
              type:   "order",
              title:  "Payment Failed",
              body:   `Payment for order ${order.orderNumber} failed. Please try again.`,
              data:   { orderId: order._id },
            }).catch(() => {});
          }
        }
        break;
      }

      case "payment_intent.canceled": {
        const pi = event.data.object;
        await Payment.findOneAndUpdate({ stripePaymentIntentId: pi.id }, { status: "failed" });
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;
        await Payment.findOneAndUpdate(
          { stripeChargeId: charge.id },
          { status: "refunded", refundAmount: charge.amount_refunded / 100, refundedAt: new Date() }
        );
        break;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object;
        logger.warn("[STRIPE] Dispute created", { chargeId: dispute.charge, reason: dispute.reason });
        await Payment.findOneAndUpdate({ stripeChargeId: dispute.charge }, { status: "disputed" });
        break;
      }

      case "charge.dispute.lost": {
        const dispute = event.data.object;
        logger.error("[STRIPE] Dispute lost", { chargeId: dispute.charge });
        break;
      }

      default:
        logger.info(`[STRIPE] Unhandled event: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
};

// ─── Get Payment History (current user) ──────────────────────────────────────
exports.getPaymentHistory = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = { user: req.user._id };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.method) filter.method = req.query.method;

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate("order", "orderNumber total status createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Payment.countDocuments(filter),
    ]);

    res.json({
      success:    true,
      payments,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Verify Payment (check status for a specific order) ───────────────────────
exports.verifyPayment = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.orderId, user: req.user._id })
      .select("orderNumber paymentStatus paymentMethod total");
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    const payment = await Payment.findOne({ order: order._id }).sort({ createdAt: -1 });

    res.json({
      success:       true,
      order:         { _id: order._id, orderNumber: order.orderNumber, paymentMethod: order.paymentMethod, total: order.total },
      paymentStatus: order.paymentStatus,
      payment:       payment || null,
    });
  } catch (err) {
    next(err);
  }
};

// ─── Request Refund ───────────────────────────────────────────────────────────
exports.requestRefund = async (req, res, next) => {
  try {
    const { orderId, reason } = req.body;
    if (!orderId) return res.status(400).json({ success: false, message: "orderId is required" });

    const order = await Order.findOne({ _id: orderId, user: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (!["cancelled", "delivered"].includes(order.status)) {
      return res.status(400).json({ success: false, message: "Order is not eligible for refund" });
    }

    const payment = await Payment.findOne({ order: orderId, status: "completed" });
    if (!payment) return res.status(404).json({ success: false, message: "No completed payment found for this order" });

    if (payment.status === "refunded") {
      return res.status(400).json({ success: false, message: "Payment already refunded" });
    }

    if (payment.method === "card" && payment.stripeChargeId) {
      const stripe = getStripe();
      await stripe.refunds.create({ charge: payment.stripeChargeId });
      payment.status       = "refunded";
      payment.refundAmount = payment.amount;
      payment.refundReason = reason;
      payment.refundedAt   = new Date();
      await payment.save();
    } else {
      // Wallet refund (cash COD or wallet payment)
      let wallet = await Wallet.findOne({ user: req.user._id });
      if (!wallet) wallet = await Wallet.create({ user: req.user._id, balance: 0 });

      const newBalance = wallet.balance + payment.amount;
      wallet.transactions.push({
        type:         "refund",
        amount:       payment.amount,
        description:  `Refund for order ${order.orderNumber}`,
        order:        order._id,
        reference:    `REFUND-${order.orderNumber}`,
        balanceAfter: newBalance,
      });
      wallet.balance = newBalance;
      await wallet.save();

      payment.status       = "refunded";
      payment.refundAmount = payment.amount;
      payment.refundReason = reason;
      payment.refundedAt   = new Date();
      await payment.save();
    }

    await Order.findByIdAndUpdate(orderId, { status: "refunded", paymentStatus: "refunded" });

    createNotification({
      userId: req.user._id,
      type:   "payment",
      title:  "Refund Processed",
      body:   `Your refund of SAR ${payment.amount.toFixed(2)} for order ${order.orderNumber} has been processed`,
      data:   { orderId: order._id, orderNumber: order.orderNumber },
    }).catch(() => {});

    res.json({ success: true, message: "Refund processed successfully", refundAmount: payment.amount });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: Get All Payments ──────────────────────────────────────────────────
exports.adminGetAllPayments = async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const skip   = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.method) filter.method = req.query.method;
    if (req.query.userId) filter.user   = req.query.userId;
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate)   filter.createdAt.$lte = new Date(req.query.endDate);
    }

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate("user",  "name email phone")
        .populate("order", "orderNumber total status paymentMethod")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Payment.countDocuments(filter),
    ]);

    // Revenue summary
    const summary = await Payment.aggregate([
      { $match: { ...filter, status: "completed" } },
      { $group: { _id: null, totalRevenue: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);

    res.json({
      success:    true,
      payments,
      summary:    summary[0] || { totalRevenue: 0, count: 0 },
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: Update Payment Status ─────────────────────────────────────────────
exports.adminUpdatePaymentStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;
    const allowed = ["pending", "completed", "failed", "refunded", "disputed"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Allowed: ${allowed.join(", ")}` });
    }

    const payment = await Payment.findById(req.params.id).populate("order", "orderNumber user");
    if (!payment) return res.status(404).json({ success: false, message: "Payment not found" });

    const prevStatus = payment.status;
    payment.status   = status;
    if (status === "completed") payment.paidAt = new Date();
    if (status === "refunded")  payment.refundedAt = new Date();
    await payment.save();

    // Sync order paymentStatus when admin marks as completed/refunded
    if (payment.order) {
      if (status === "completed") {
        await Order.findByIdAndUpdate(payment.order._id, { paymentStatus: "paid" });
      } else if (status === "refunded") {
        await Order.findByIdAndUpdate(payment.order._id, { paymentStatus: "refunded", status: "refunded" });
      } else if (status === "failed") {
        await Order.findByIdAndUpdate(payment.order._id, { paymentStatus: "failed" });
      }
    }

    logger.info(`[ADMIN] Payment ${payment._id} status changed ${prevStatus} → ${status} by ${req.user._id}${note ? ` — ${note}` : ""}`);

    res.json({ success: true, payment });
  } catch (err) {
    next(err);
  }
};

// ─── Internal: Create COD Payment Record ─────────────────────────────────────
// Called from order controller after createOrder for cash orders
exports.createCodPaymentRecord = async (orderId, userId, amount) => {
  try {
    await Payment.create({
      order:  orderId,
      user:   userId,
      method: "cash",
      amount,
      status: "pending",
    });
  } catch (err) {
    logger.error("[PAYMENT] Failed to create COD payment record", { orderId, err: err.message });
  }
};
