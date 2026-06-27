const Return   = require("../models/Return.model");
const Order    = require("../models/Order.model");
const Medicine = require("../models/Medicine.model");
const Payment  = require("../models/Payment.model");
const Wallet   = require("../models/Wallet.model");
const { createNotification } = require("../utils/notification.util");
const logger = require("../config/logger.config");

const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not configured");
  return require("stripe")(process.env.STRIPE_SECRET_KEY);
};

const RETURNABLE_STATUSES = ["delivered"];
const RETURN_WINDOW_DAYS  = 7; // customer has 7 days from delivery to request a return

// ─── Create Return Request ─────────────────────────────────────────────────────
exports.createReturn = async (req, res, next) => {
  try {
    const { orderId, items, refundMethod = "wallet" } = req.body;

    if (!orderId) return res.status(400).json({ success: false, message: "orderId is required" });
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "items array is required" });
    }

    const order = await Order.findOne({ _id: orderId, user: req.user._id })
      .populate("items.medicine", "name price");
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (!RETURNABLE_STATUSES.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Only delivered orders can be returned (current status: ${order.status})`,
      });
    }

    // Enforce return window
    if (order.deliveredAt) {
      const windowMs = RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
      if (Date.now() - new Date(order.deliveredAt).getTime() > windowMs) {
        return res.status(400).json({
          success: false,
          message: `Return window of ${RETURN_WINDOW_DAYS} days has expired`,
        });
      }
    }

    // Check no pending/approved return already exists
    const existing = await Return.findOne({ order: orderId, status: { $in: ["pending", "approved", "processing"] } });
    if (existing) {
      return res.status(400).json({ success: false, message: "A return request is already in progress for this order" });
    }

    // Validate requested items against order
    const orderItemMap = new Map(
      order.items.map((i) => [i.medicine._id.toString(), i])
    );

    let totalRefundAmount = 0;
    const returnItems = [];

    for (const ri of items) {
      const { medicineId, quantity, reason } = ri;
      const orderItem = orderItemMap.get(medicineId);
      if (!orderItem) {
        return res.status(400).json({ success: false, message: `Medicine ${medicineId} not found in this order` });
      }
      if (quantity > orderItem.quantity) {
        return res.status(400).json({
          success: false,
          message: `Cannot return more than ordered quantity for ${orderItem.name}`,
        });
      }

      const itemRefund = orderItem.price * quantity;
      totalRefundAmount += itemRefund;
      returnItems.push({
        medicine: medicineId,
        name:     orderItem.name,
        quantity,
        price:    orderItem.price,
        reason,
      });
    }

    // Determine full vs partial
    const totalOrderQty  = order.items.reduce((s, i) => s + i.quantity, 0);
    const returnedQty    = returnItems.reduce((s, i) => s + i.quantity, 0);
    const returnType     = returnedQty === totalOrderQty ? "full" : "partial";

    const returnNumber = `RET-${Date.now()}-${require("crypto").randomBytes(3).toString("hex")}`;

    const returnDoc = await Return.create({
      returnNumber,
      order:             order._id,
      user:              req.user._id,
      items:             returnItems,
      returnType,
      refundMethod,
      totalRefundAmount,
      status:            "pending",
      trackingHistory:   [{ status: "pending", note: "Return request submitted", updatedBy: req.user._id }],
    });

    createNotification({
      userId: req.user._id,
      type:   "order",
      title:  "Return Request Submitted",
      body:   `Your return request ${returnNumber} has been submitted and is under review`,
      data:   { returnId: returnDoc._id, returnNumber, orderId: order._id },
    }).catch(() => {});

    res.status(201).json({ success: true, return: returnDoc });
  } catch (err) {
    next(err);
  }
};

// ─── Get My Returns ────────────────────────────────────────────────────────────
exports.getMyReturns = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const skip  = (page - 1) * limit;

    const filter = { user: req.user._id };
    if (typeof req.query.status === "string") filter.status = req.query.status;

    const [returns, total] = await Promise.all([
      Return.find(filter)
        .populate("order", "orderNumber total status")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Return.countDocuments(filter),
    ]);

    res.json({ success: true, returns, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

// ─── Get Return by ID ─────────────────────────────────────────────────────────
exports.getReturnById = async (req, res, next) => {
  try {
    const returnDoc = await Return.findById(req.params.id)
      .populate("order",       "orderNumber total status paymentMethod")
      .populate("user",        "name email phone")
      .populate("processedBy", "name");

    if (!returnDoc) return res.status(404).json({ success: false, message: "Return not found" });

    // Customers can only see their own returns
    if (req.user.role === "customer" && returnDoc.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    res.json({ success: true, return: returnDoc });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: Get All Returns ────────────────────────────────────────────────────
exports.getAllReturns = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = {};
    if (typeof req.query.status     === "string") filter.status     = req.query.status;
    if (typeof req.query.userId     === "string") filter.user       = req.query.userId;
    if (typeof req.query.returnType === "string") filter.returnType = req.query.returnType;
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (typeof req.query.startDate === "string") filter.createdAt.$gte = new Date(req.query.startDate);
      if (typeof req.query.endDate   === "string") filter.createdAt.$lte = new Date(req.query.endDate);
    }

    const [returns, total] = await Promise.all([
      Return.find(filter)
        .populate("user",  "name email phone")
        .populate("order", "orderNumber total paymentMethod")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Return.countDocuments(filter),
    ]);

    res.json({ success: true, returns, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: Approve Return ────────────────────────────────────────────────────
// Approving triggers the refund immediately and moves status to "processing"
// (waiting for physical goods). Stock is restored when `completeReturn` is called.
exports.approveReturn = async (req, res, next) => {
  try {
    const { adminNote } = req.body;

    const returnDoc = await Return.findById(req.params.id).populate("order", "orderNumber paymentMethod user");
    if (!returnDoc) return res.status(404).json({ success: false, message: "Return not found" });
    if (returnDoc.status !== "pending") {
      return res.status(400).json({ success: false, message: `Return is already ${returnDoc.status}` });
    }

    const order   = returnDoc.order;
    const refundAmt = returnDoc.totalRefundAmount;

    if (returnDoc.refundMethod === "original_payment") {
      // Try Stripe refund if a card charge exists
      const payment = await Payment.findOne({ order: order._id, status: "completed", method: "card" });
      if (payment && payment.stripeChargeId) {
        try {
          const stripe = getStripe();
          await stripe.refunds.create({
            charge: payment.stripeChargeId,
            amount: Math.round(refundAmt * 100),
          });
          payment.status       = "refunded";
          payment.refundAmount = refundAmt;
          payment.refundedAt   = new Date();
          await payment.save();
        } catch (stripeErr) {
          logger.warn("[RETURN] Stripe refund failed, falling back to wallet", { err: stripeErr.message });
          await _creditWallet(order, refundAmt);
        }
      } else {
        // No card charge — credit wallet instead
        await _creditWallet(order, refundAmt);
      }
    } else {
      // Wallet refund
      await _creditWallet(order, refundAmt);
    }

    returnDoc.status      = "processing";
    returnDoc.adminNote   = adminNote || "";
    returnDoc.processedBy = req.user._id;
    returnDoc.processedAt = new Date();
    returnDoc.trackingHistory.push({
      status:    "processing",
      note:      `Approved by admin. Refund of SAR ${refundAmt.toFixed(2)} issued.`,
      updatedBy: req.user._id,
    });
    await returnDoc.save();

    // Notify customer
    createNotification({
      userId: returnDoc.user,
      type:   "order",
      title:  "Return Approved",
      body:   `Your return ${returnDoc.returnNumber} has been approved. Refund of SAR ${refundAmt.toFixed(2)} issued.`,
      data:   { returnId: returnDoc._id, returnNumber: returnDoc.returnNumber },
    }).catch(() => {});

    res.json({ success: true, return: returnDoc });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: Reject Return ─────────────────────────────────────────────────────
exports.rejectReturn = async (req, res, next) => {
  try {
    const { rejectionReason, adminNote } = req.body;
    if (!rejectionReason) {
      return res.status(400).json({ success: false, message: "rejectionReason is required" });
    }

    const returnDoc = await Return.findById(req.params.id);
    if (!returnDoc) return res.status(404).json({ success: false, message: "Return not found" });
    if (returnDoc.status !== "pending") {
      return res.status(400).json({ success: false, message: `Return is already ${returnDoc.status}` });
    }

    returnDoc.status          = "rejected";
    returnDoc.rejectionReason = rejectionReason;
    returnDoc.adminNote       = adminNote || "";
    returnDoc.processedBy     = req.user._id;
    returnDoc.processedAt     = new Date();
    returnDoc.trackingHistory.push({
      status:    "rejected",
      note:      `Rejected: ${rejectionReason}`,
      updatedBy: req.user._id,
    });
    await returnDoc.save();

    createNotification({
      userId: returnDoc.user,
      type:   "order",
      title:  "Return Rejected",
      body:   `Your return ${returnDoc.returnNumber} was rejected. Reason: ${rejectionReason}`,
      data:   { returnId: returnDoc._id, returnNumber: returnDoc.returnNumber },
    }).catch(() => {});

    res.json({ success: true, return: returnDoc });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: Complete Return (physical goods received) ─────────────────────────
exports.completeReturn = async (req, res, next) => {
  try {
    const returnDoc = await Return.findById(req.params.id);
    if (!returnDoc) return res.status(404).json({ success: false, message: "Return not found" });
    if (returnDoc.status !== "processing") {
      return res.status(400).json({ success: false, message: `Return must be in processing state (current: ${returnDoc.status})` });
    }

    // Restock inventory
    for (const item of returnDoc.items) {
      await Medicine.findByIdAndUpdate(
        item.medicine,
        { $inc: { stock: item.quantity, soldCount: -item.quantity } }
      );
    }

    returnDoc.status        = "completed";
    returnDoc.completedAt   = new Date();
    returnDoc.stockRestored = true;
    returnDoc.trackingHistory.push({
      status:    "completed",
      note:      "Physical goods received and inventory restocked",
      updatedBy: req.user._id,
    });
    await returnDoc.save();

    // Update order status to refunded
    await Order.findByIdAndUpdate(returnDoc.order, { status: "refunded", paymentStatus: "refunded" });

    createNotification({
      userId: returnDoc.user,
      type:   "order",
      title:  "Return Completed",
      body:   `Your return ${returnDoc.returnNumber} has been completed`,
      data:   { returnId: returnDoc._id, returnNumber: returnDoc.returnNumber },
    }).catch(() => {});

    res.json({ success: true, return: returnDoc });
  } catch (err) {
    next(err);
  }
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _creditWallet(order, amount) {
  // Ensure wallet exists, then atomically increment balance
  await Wallet.findOneAndUpdate(
    { user: order.user },
    { $setOnInsert: { user: order.user, balance: 0, transactions: [] } },
    { upsert: true }
  );

  const updated = await Wallet.findOneAndUpdate(
    { user: order.user },
    { $inc: { balance: amount } },
    { new: true }
  );

  await Wallet.findByIdAndUpdate(updated._id, {
    $push: {
      transactions: {
        type:         "refund",
        amount,
        description:  `Refund for return on order ${order.orderNumber}`,
        order:        order._id,
        reference:    `RETURN-REFUND-${order.orderNumber}`,
        balanceAfter: updated.balance,
        createdAt:    new Date(),
      },
    },
  });
}
