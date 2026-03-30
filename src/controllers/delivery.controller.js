const DeliveryZone = require("../models/DeliveryZone.model");
const Order = require("../models/Order.model");

// ─── Zones ────────────────────────────────────────────────────────────────────
exports.getAllZones = async (req, res, next) => {
  try {
    const zones = await DeliveryZone.find({ isActive: true }).sort({ name: 1 });
    res.json({ success: true, zones });
  } catch (err) {
    next(err);
  }
};

exports.getZoneById = async (req, res, next) => {
  try {
    const zone = await DeliveryZone.findById(req.params.id);
    if (!zone) return res.status(404).json({ success: false, message: "Delivery zone not found" });
    res.json({ success: true, zone });
  } catch (err) {
    next(err);
  }
};

exports.createZone = async (req, res, next) => {
  try {
    const zone = await DeliveryZone.create(req.body);
    res.status(201).json({ success: true, zone });
  } catch (err) {
    next(err);
  }
};

exports.updateZone = async (req, res, next) => {
  try {
    const zone = await DeliveryZone.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!zone) return res.status(404).json({ success: false, message: "Delivery zone not found" });
    res.json({ success: true, zone });
  } catch (err) {
    next(err);
  }
};

exports.deleteZone = async (req, res, next) => {
  try {
    const zone = await DeliveryZone.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!zone) return res.status(404).json({ success: false, message: "Delivery zone not found" });
    res.json({ success: true, message: "Zone deactivated" });
  } catch (err) {
    next(err);
  }
};

// ─── Calculate Delivery Fee ───────────────────────────────────────────────────
exports.calculateFee = async (req, res, next) => {
  try {
    const { city, orderAmount } = req.body;

    const zone = await DeliveryZone.findOne({
      isActive: true,
      cities: { $regex: new RegExp(`^${city}$`, "i") },
    });

    if (!zone) {
      return res.json({
        success: true,
        available: false,
        message: "Delivery not available to this city",
      });
    }

    const fee = orderAmount >= zone.freeDeliveryThreshold ? 0 : zone.deliveryFee;

    res.json({
      success: true,
      available: true,
      zone: { id: zone._id, name: zone.name },
      deliveryFee: fee,
      freeDeliveryThreshold: zone.freeDeliveryThreshold,
      estimatedTime: `${zone.minDeliveryTime}-${zone.maxDeliveryTime} hours`,
      slots: zone.slots.filter((s) => s.isActive),
    });
  } catch (err) {
    next(err);
  }
};

// ─── Assign Driver ────────────────────────────────────────────────────────────
exports.assignDriver = async (req, res, next) => {
  try {
    const { orderId, driverId } = req.body;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (!["confirmed", "processing"].includes(order.status)) {
      return res.status(400).json({ success: false, message: "Cannot assign driver to this order" });
    }

    order.driver = driverId;
    order.status = "shipped";
    order.trackingHistory.push({
      status: "shipped",
      note: "Driver assigned and order shipped",
      updatedBy: req.user._id,
      timestamp: new Date(),
    });
    await order.save();

    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

// ─── Driver: Get My Deliveries ────────────────────────────────────────────────
exports.getMyDeliveries = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = { driver: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate("user", "name phone")
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

// ─── Driver: Mark Delivered ───────────────────────────────────────────────────
exports.markDelivered = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.orderId, driver: req.user._id, status: "shipped" });
    if (!order) return res.status(404).json({ success: false, message: "Order not found or not assigned to you" });

    order.status = "delivered";
    order.deliveredAt = new Date();
    order.paymentStatus = "paid";
    order.trackingHistory.push({ status: "delivered", note: "Delivered by driver", updatedBy: req.user._id, timestamp: new Date() });
    await order.save();

    res.json({ success: true, message: "Order marked as delivered" });
  } catch (err) {
    next(err);
  }
};
