const Payment = require("../models/Payment.model");
const Order = require("../models/Order.model");
const Wallet = require("../models/Wallet.model");

// Lazy-init Stripe so missing key at startup doesn't crash the app
const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not configured");
  return require("stripe")(process.env.STRIPE_SECRET_KEY);
};

// ─── Create Payment Intent (Stripe) ──────────────────────────────────────────
exports.createPaymentIntent = async (req, res, next) => {
  try {
    const { orderId } = req.body;

    const order = await Order.findOne({ _id: orderId, user: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (order.paymentStatus === "paid") {
      return res.status(400).json({ success: false, message: "Order already paid" });
    }

    const amountInHalalas = Math.round(order.total * 100); // SAR → halalas

    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInHalalas,
      currency: "sar",
      metadata: { orderId: order._id.toString(), userId: req.user._id.toString(), orderNumber: order.orderNumber },
      description: `Order ${order.orderNumber}`,
    });

    // Create payment record
    await Payment.create({
      order: order._id,
      user: req.user._id,
      method: "card",
      amount: order.total,
      stripePaymentIntentId: paymentIntent.id,
    });

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
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ success: false, message: `Webhook error: ${err.message}` });
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object;
      const { orderId } = pi.metadata;

      await Order.findByIdAndUpdate(orderId, { paymentStatus: "paid", status: "confirmed" });
      await Payment.findOneAndUpdate(
        { stripePaymentIntentId: pi.id },
        { status: "completed", stripeChargeId: pi.latest_charge, paidAt: new Date() }
      );
    }

    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object;
      await Payment.findOneAndUpdate({ stripePaymentIntentId: pi.id }, { status: "failed" });
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
};

// ─── Get Payment History ──────────────────────────────────────────────────────
exports.getPaymentHistory = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };
    const [payments, total] = await Promise.all([
      Payment.find(filter).populate("order", "orderNumber total status").sort({ createdAt: -1 }).skip(skip).limit(limit),
      Payment.countDocuments(filter),
    ]);

    res.json({ success: true, payments, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

// ─── Request Refund ───────────────────────────────────────────────────────────
exports.requestRefund = async (req, res, next) => {
  try {
    const { orderId, reason } = req.body;

    const order = await Order.findOne({ _id: orderId, user: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (order.status !== "cancelled" && order.status !== "delivered") {
      return res.status(400).json({ success: false, message: "Order is not eligible for refund" });
    }

    const payment = await Payment.findOne({ order: orderId, status: "completed" });
    if (!payment) return res.status(404).json({ success: false, message: "No completed payment found" });

    if (payment.method === "card" && payment.stripeChargeId) {
      // Stripe refund
      const stripe = getStripe();
      const refund = await stripe.refunds.create({ charge: payment.stripeChargeId });
      payment.status = "refunded";
      payment.refundAmount = payment.amount;
      payment.refundReason = reason;
      payment.refundedAt = new Date();
      await payment.save();

      await Order.findByIdAndUpdate(orderId, { status: "refunded", paymentStatus: "refunded" });
    } else if (payment.method === "wallet") {
      // Credit back to wallet
      let wallet = await Wallet.findOne({ user: req.user._id });
      if (!wallet) wallet = await Wallet.create({ user: req.user._id, balance: 0 });

      wallet.transactions.push({
        type: "refund",
        amount: payment.amount,
        description: `Refund for order ${order.orderNumber}`,
        order: order._id,
        reference: `REFUND-${order.orderNumber}`,
        balanceAfter: wallet.balance + payment.amount,
      });
      wallet.balance += payment.amount;
      await wallet.save();

      payment.status = "refunded";
      payment.refundAmount = payment.amount;
      payment.refundedAt = new Date();
      await payment.save();

      await Order.findByIdAndUpdate(orderId, { status: "refunded", paymentStatus: "refunded" });
    }

    res.json({ success: true, message: "Refund processed successfully" });
  } catch (err) {
    next(err);
  }
};
