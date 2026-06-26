const Order = require("../models/Order.model");
const Medicine = require("../models/Medicine.model");
const Cart = require("../models/Cart.model");
const Coupon = require("../models/Coupon.model");
const Prescription = require("../models/Prescription.model");
const Payment = require("../models/Payment.model");
const User = require("../models/User.model");
const LoyaltyTransaction = require("../models/LoyaltyTransaction.model");
const logger = require("../config/logger.config");
const { createNotification } = require("../utils/notification.util");
const { sendOrderConfirmationEmail, sendOrderStatusEmail } = require("../utils/email.util");
const Wallet = require("../models/Wallet.model");

const LOYALTY_RATE = 1; // 1 point per SAR spent

// ─── Get All Orders (admin/pharmacist) ───────────────────────────────────────
exports.getAllOrders = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.paymentMethod) filter.paymentMethod = req.query.paymentMethod;
    if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
    if (req.query.userId) filter.user = req.query.userId;
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate);
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate("user", "name email phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments(filter),
    ]);

    res.json({ success: true, orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

// ─── Get Single Order ─────────────────────────────────────────────────────────
exports.getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("user", "name email phone")
      .populate("items.medicine", "name images")
      .populate("prescription")
      .populate("driver", "name phone");

    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (
      req.user.role === "customer" &&
      order.user._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

// ─── Get User's Orders ────────────────────────────────────────────────────────
exports.getUserOrders = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Order.countDocuments(filter),
    ]);

    res.json({ success: true, orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

// ─── Create Order ─────────────────────────────────────────────────────────────
exports.createOrder = async (req, res, next) => {
  try {
    const {
      items,
      shippingAddress,
      paymentMethod,
      prescriptionId,
      notes,
      deliveryZone,
      deliverySlot,
      couponCode,
      useWallet,
      useLoyaltyPoints,
    } = req.body;

    // Validate & build order items
    const orderItems = [];
    let subtotal = 0;

    for (const item of items) {
      const medicine = await Medicine.findOne({ _id: item.medicine, isActive: true });
      if (!medicine) {
        return res.status(400).json({ success: false, message: `Medicine ${item.medicine} not found` });
      }
      if (medicine.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${medicine.name}`,
        });
      }
      if (medicine.requiresPrescription && !prescriptionId) {
        return res.status(400).json({
          success: false,
          message: `${medicine.name} requires a valid prescription`,
        });
      }

      const unitPrice = medicine.isFlashSale && medicine.flashSalePrice
        ? medicine.flashSalePrice
        : medicine.finalPrice;

      orderItems.push({
        medicine: medicine._id,
        name: medicine.name,
        image: medicine.images?.[0]?.url || "",
        price: unitPrice,
        quantity: item.quantity,
        requiresPrescription: medicine.requiresPrescription,
      });
      subtotal += unitPrice * item.quantity;
    }

    // Validate prescription if provided
    if (prescriptionId) {
      const prescription = await Prescription.findOne({ _id: prescriptionId, user: req.user._id });
      if (!prescription) {
        return res.status(400).json({ success: false, message: "Prescription not found" });
      }
      if (prescription.status !== "approved") {
        return res.status(400).json({ success: false, message: "Prescription not yet approved" });
      }
    }

    // Delivery fee
    let deliveryFee = 0;
    if (deliveryZone) {
      const DeliveryZone = require("../models/DeliveryZone.model");
      const zone = await DeliveryZone.findById(deliveryZone);
      if (zone) {
        deliveryFee = subtotal >= zone.freeDeliveryThreshold ? 0 : zone.deliveryFee;
      }
    }

    // Coupon discount
    let couponDiscount = 0;
    let appliedCoupon = null;
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
      if (coupon && coupon.isValid()) {
        const userUsage = coupon.usedBy.filter((id) => id.toString() === req.user._id.toString()).length;
        if (userUsage < coupon.perUserLimit && subtotal >= coupon.minOrderAmount) {
          couponDiscount =
            coupon.type === "percentage" ? (subtotal * coupon.value) / 100 : coupon.value;
          if (coupon.maxDiscount) couponDiscount = Math.min(couponDiscount, coupon.maxDiscount);
          appliedCoupon = coupon;
        }
      }
    }

    // Loyalty points discount
    let loyaltyPointsUsed = 0;
    const user = await User.findById(req.user._id);
    if (useLoyaltyPoints && user.loyaltyPoints > 0) {
      const maxPointsDiscount = Math.floor(subtotal * 0.1); // max 10% of subtotal
      loyaltyPointsUsed = Math.min(user.loyaltyPoints, maxPointsDiscount);
    }

    // Wallet payment — validate balance up front
    let walletUsed = 0;
    let walletDoc = null;
    if (useWallet && paymentMethod === "wallet") {
      const WalletModel = require("../models/Wallet.model");
      walletDoc = await WalletModel.findOne({ user: req.user._id });
      const orderTotal = subtotal + deliveryFee - couponDiscount - loyaltyPointsUsed;
      if (!walletDoc || walletDoc.balance < orderTotal) {
        return res.status(400).json({ success: false, message: "Insufficient wallet balance" });
      }
      walletUsed = orderTotal;
    }

    const total = Math.max(0, subtotal + deliveryFee - couponDiscount - loyaltyPointsUsed);

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const order = await Order.create({
      orderNumber,
      user: req.user._id,
      items: orderItems,
      shippingAddress,
      paymentMethod,
      paymentStatus: paymentMethod === "wallet" ? "paid" : "pending",
      subtotal,
      deliveryFee,
      discount: 0,
      couponDiscount,
      total,
      coupon: appliedCoupon?._id,
      couponCode,
      deliveryZone,
      deliverySlot,
      prescription: prescriptionId,
      notes,
      loyaltyPointsUsed,
      trackingHistory: [{ status: "pending", note: "Order placed", updatedBy: req.user._id }],
    });

    // Deduct wallet balance
    if (walletUsed > 0 && walletDoc) {
      walletDoc.transactions.push({
        type: "debit",
        amount: walletUsed,
        description: `Payment for order ${orderNumber}`,
        order: order._id,
        balanceAfter: walletDoc.balance - walletUsed,
      });
      walletDoc.balance -= walletUsed;
      await walletDoc.save();
    }

    // Deduct stock
    for (const item of items) {
      await Medicine.findByIdAndUpdate(item.medicine, { $inc: { stock: -item.quantity, soldCount: item.quantity } });
    }

    // Mark coupon as used
    if (appliedCoupon) {
      appliedCoupon.usageCount += 1;
      appliedCoupon.usedBy.push(req.user._id);
      await appliedCoupon.save();
    }

    // Deduct loyalty points
    if (loyaltyPointsUsed > 0) {
      user.loyaltyPoints -= loyaltyPointsUsed;
      await user.save({ validateBeforeSave: false });
      await LoyaltyTransaction.create({
        user: req.user._id,
        type: "redeem",
        points: -loyaltyPointsUsed,
        balance: user.loyaltyPoints,
        description: `Redeemed for order ${orderNumber}`,
        order: order._id,
      });
    }

    // Earn loyalty points
    const pointsEarned = Math.floor(total * LOYALTY_RATE);
    if (pointsEarned > 0) {
      user.loyaltyPoints += pointsEarned;
      await user.save({ validateBeforeSave: false });
      await LoyaltyTransaction.create({
        user: req.user._id,
        type: "earn",
        points: pointsEarned,
        balance: user.loyaltyPoints,
        description: `Earned from order ${orderNumber}`,
        order: order._id,
      });
      await Order.findByIdAndUpdate(order._id, { loyaltyPointsEarned: pointsEarned });
    }

    // Process referral reward on first order (non-blocking)
    const { processReferralReward } = require("./referral.controller");
    processReferralReward(req.user._id, order._id);

    // Clear cart
    await Cart.findOneAndUpdate({ user: req.user._id }, { items: [], coupon: null, couponDiscount: 0 });

    // Mark prescription as used
    if (prescriptionId) {
      await Prescription.findByIdAndUpdate(prescriptionId, { isUsed: true });
    }

    // Send notification + confirmation email (non-blocking)
    createNotification({
      userId: req.user._id,
      type: "order",
      title: "Order Placed",
      body: `Your order ${orderNumber} has been placed successfully`,
      data: { orderId: order._id, orderNumber },
    }).catch(() => {});

    sendOrderConfirmationEmail(user, order).catch(() => {});

    // Create a pending payment record for COD orders so transaction log is complete
    if (paymentMethod === "cash") {
      Payment.create({ order: order._id, user: req.user._id, method: "cash", amount: total, status: "pending" })
        .catch((e) => logger.error("[ORDER] COD payment record creation failed", { err: e.message }));
    }

    res.status(201).json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

// ─── Update Order Status ──────────────────────────────────────────────────────
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { status, note, driverId } = req.body;

    const order = await Order.findById(req.params.id).populate("user", "name email");
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    const validTransitions = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["processing", "cancelled"],
      processing: ["shipped", "cancelled"],
      shipped: ["delivered"],
      delivered: [],
      cancelled: [],
      refunded: [],
    };

    if (!validTransitions[order.status]?.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition from ${order.status} to ${status}`,
      });
    }

    order.status = status;
    order.trackingHistory.push({ status, note: note || "", updatedBy: req.user._id, timestamp: new Date() });

    if (status === "delivered") {
      order.deliveredAt = new Date();
      order.paymentStatus = "paid";
    }

    if (status === "cancelled") {
      order.cancelledAt = new Date();
      order.cancellationReason = note;

      // Restore stock
      for (const item of order.items) {
        await Medicine.findByIdAndUpdate(item.medicine, {
          $inc: { stock: item.quantity, soldCount: -item.quantity },
        });
      }

      // Refund wallet if paid via wallet
      if (order.paymentMethod === "wallet" && order.paymentStatus === "paid") {
        const wallet = await Wallet.findOne({ user: order.user._id });
        if (wallet) {
          wallet.balance += order.total;
          wallet.transactions.push({
            type: "refund",
            amount: order.total,
            description: `Refund for cancelled order ${order.orderNumber}`,
            order: order._id,
            balanceAfter: wallet.balance,
          });
          await wallet.save();
        }
        order.paymentStatus = "refunded";
      } else if (order.paymentStatus === "paid") {
        order.paymentStatus = "refunded";
      }

      // Roll back coupon usage
      if (order.coupon) {
        await Coupon.findByIdAndUpdate(order.coupon, {
          $inc: { usageCount: -1 },
          $pull: { usedBy: order.user._id },
        });
      }

      // Roll back loyalty points earned on this order
      if (order.loyaltyPointsEarned > 0) {
        const updatedUser = await User.findByIdAndUpdate(
          order.user._id,
          { $inc: { loyaltyPoints: -order.loyaltyPointsEarned } },
          { new: true }
        );
        await LoyaltyTransaction.create({
          user: order.user._id,
          type: "adjustment",
          points: -order.loyaltyPointsEarned,
          balance: Math.max(0, updatedUser.loyaltyPoints),
          description: `Points reversed for cancelled order ${order.orderNumber}`,
          order: order._id,
        });
      }
    }

    if (driverId && status === "shipped") order.driver = driverId;

    await order.save();

    // Notify user + send status email
    const statusMessages = {
      confirmed: "Your order has been confirmed",
      processing: "Your order is being prepared",
      shipped: "Your order is on the way",
      delivered: "Your order has been delivered",
      cancelled: "Your order has been cancelled",
    };

    if (statusMessages[status]) {
      const populatedUser = order.user;
      createNotification({
        userId: populatedUser._id,
        type: "order",
        title: `Order ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        body: statusMessages[status],
        data: { orderId: order._id, orderNumber: order.orderNumber },
      }).catch(() => {});
      sendOrderStatusEmail(populatedUser, order, status).catch(() => {});
    }

    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

// ─── Cancel Order ─────────────────────────────────────────────────────────────
exports.cancelOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (order.user.toString() !== req.user._id.toString() && !["admin", "pharmacist"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    if (!["pending", "confirmed"].includes(order.status)) {
      return res.status(400).json({ success: false, message: "Order cannot be cancelled at this stage" });
    }

    order.status = "cancelled";
    order.cancelledAt = new Date();
    order.cancellationReason = req.body.reason || "Cancelled by user";
    order.trackingHistory.push({
      status: "cancelled",
      note: order.cancellationReason,
      updatedBy: req.user._id,
      timestamp: new Date(),
    });

    // Restore stock
    for (const item of order.items) {
      await Medicine.findByIdAndUpdate(item.medicine, {
        $inc: { stock: item.quantity, soldCount: -item.quantity },
      });
    }

    // Refund wallet if paid via wallet
    if (order.paymentMethod === "wallet" && order.paymentStatus === "paid") {
      const wallet = await Wallet.findOne({ user: order.user });
      if (wallet) {
        wallet.balance += order.total;
        wallet.transactions.push({
          type: "refund",
          amount: order.total,
          description: `Refund for cancelled order ${order.orderNumber}`,
          order: order._id,
          balanceAfter: wallet.balance,
        });
        await wallet.save();
      }
      order.paymentStatus = "refunded";
    } else if (order.paymentStatus === "paid") {
      order.paymentStatus = "refunded";
    }

    // Roll back coupon usage
    if (order.coupon) {
      await Coupon.findByIdAndUpdate(order.coupon, {
        $inc: { usageCount: -1 },
        $pull: { usedBy: order.user },
      });
    }

    // Roll back loyalty points earned on this order
    if (order.loyaltyPointsEarned > 0) {
      const updatedUser = await User.findByIdAndUpdate(
        order.user,
        { $inc: { loyaltyPoints: -order.loyaltyPointsEarned } },
        { new: true }
      );
      await LoyaltyTransaction.create({
        user: order.user,
        type: "adjustment",
        points: -order.loyaltyPointsEarned,
        balance: Math.max(0, updatedUser.loyaltyPoints),
        description: `Points reversed for cancelled order ${order.orderNumber}`,
        order: order._id,
      });
    }

    await order.save();

    createNotification({
      userId: order.user,
      type: "order",
      title: "Order Cancelled",
      body: `Your order ${order.orderNumber} has been cancelled`,
      data: { orderId: order._id },
    }).catch(() => {});

    res.json({ success: true, message: "Order cancelled", order });
  } catch (err) {
    next(err);
  }
};

// ─── Reorder ──────────────────────────────────────────────────────────────────
exports.reorder = async (req, res, next) => {
  try {
    const originalOrder = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!originalOrder) return res.status(404).json({ success: false, message: "Order not found" });

    // Add original items to cart
    const Cart = require("../models/Cart.model");
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) cart = await Cart.create({ user: req.user._id, items: [] });

    for (const item of originalOrder.items) {
      const medicine = await Medicine.findOne({ _id: item.medicine, isActive: true });
      if (medicine && medicine.stock >= 1) {
        const existing = cart.items.find((ci) => ci.medicine.toString() === item.medicine.toString());
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          cart.items.push({
            medicine: item.medicine,
            quantity: item.quantity,
            price: medicine.finalPrice,
            name: medicine.name,
          });
        }
      }
    }
    await cart.save();

    res.json({ success: true, message: "Items added to cart", cartItemCount: cart.items.length });
  } catch (err) {
    next(err);
  }
};

// ─── Track Order ──────────────────────────────────────────────────────────────
exports.trackOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .select("orderNumber status trackingHistory estimatedDelivery deliveredAt cancelledAt driver user paymentMethod paymentStatus total createdAt")
      .populate("driver", "name phone driverStatus driverLocation");

    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (req.user.role === "customer" && order.user?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Build a rich timeline: sort by timestamp ascending
    const timeline = [...order.trackingHistory].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );

    // ETA calculation
    let eta = order.estimatedDelivery || null;
    if (!eta && order.status === "shipped" && order.createdAt) {
      // Default: 24 hours from order creation if no estimated delivery set
      eta = new Date(new Date(order.createdAt).getTime() + 24 * 60 * 60 * 1000);
    }

    const driverInfo = order.driver
      ? {
          name:     order.driver.name,
          phone:    order.driver.phone,
          status:   order.driver.driverStatus,
          location: order.driver.driverLocation || null,
        }
      : null;

    res.json({
      success: true,
      tracking: {
        orderId:       order._id,
        orderNumber:   order.orderNumber,
        status:        order.status,
        paymentStatus: order.paymentStatus,
        timeline,
        driver:        driverInfo,
        estimatedArrival: eta,
        deliveredAt:   order.deliveredAt || null,
        cancelledAt:   order.cancelledAt || null,
      },
    });
  } catch (err) {
    next(err);
  }
};
