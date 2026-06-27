const DeliveryZone = require("../models/DeliveryZone.model");
const Order        = require("../models/Order.model");
const User         = require("../models/User.model");
const Payment      = require("../models/Payment.model");
const { createNotification } = require("../utils/notification.util");
const logger = require("../config/logger.config");

// ── Point-in-polygon (ray casting) ────────────────────────────────────────────
function pointInPolygon(lat, lng, polygon) {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    const intersect = yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ── Zones ─────────────────────────────────────────────────────────────────────

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
    const data = { ...req.body };
    // Accept freeDeliveryAt as an alias for freeDeliveryThreshold
    if (data.freeDeliveryAt !== undefined && data.freeDeliveryThreshold === undefined) {
      data.freeDeliveryThreshold = data.freeDeliveryAt;
    }
    delete data.freeDeliveryAt;
    const zone = await DeliveryZone.create(data);
    res.status(201).json({ success: true, zone });
  } catch (err) {
    next(err);
  }
};

exports.updateZone = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (data.freeDeliveryAt !== undefined && data.freeDeliveryThreshold === undefined) {
      data.freeDeliveryThreshold = data.freeDeliveryAt;
    }
    delete data.freeDeliveryAt;
    const zone = await DeliveryZone.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
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

// ── Calculate Delivery Fee ────────────────────────────────────────────────────
// Supports city-name lookup OR lat/lng polygon matching
exports.calculateFee = async (req, res, next) => {
  try {
    const { city, lat, lng, orderAmount = 0 } = req.body;
    if (!city && (lat === undefined || lng === undefined)) {
      return res.status(400).json({ success: false, message: "Provide city or lat/lng" });
    }

    let zone = null;

    // 1. Try polygon matching when coordinates provided
    if (lat !== undefined && lng !== undefined) {
      const zones = await DeliveryZone.find({ isActive: true, "polygon.0": { $exists: true } });
      zone = zones.find((z) => pointInPolygon(lat, lng, z.polygon)) || null;
    }

    // 2. Fall back to city-name matching
    if (!zone && city) {
      zone = await DeliveryZone.findOne({
        isActive: true,
        cities:   { $regex: new RegExp(`^${city}$`, "i") },
      });
    }

    if (!zone) {
      return res.json({ success: true, available: false, message: "Delivery not available to this location" });
    }

    const fee = Number(orderAmount) >= zone.freeDeliveryThreshold ? 0 : zone.deliveryFee;

    res.json({
      success:               true,
      available:             true,
      zone:                  { id: zone._id, name: zone.name },
      deliveryFee:           fee,
      freeDeliveryThreshold: zone.freeDeliveryThreshold,
      estimatedTime:         `${zone.minDeliveryTime}–${zone.maxDeliveryTime} hours`,
      slots:                 zone.slots.filter((s) => s.isActive),
    });
  } catch (err) {
    next(err);
  }
};

// ── Assign Driver ─────────────────────────────────────────────────────────────
exports.assignDriver = async (req, res, next) => {
  try {
    const { orderId, driverId } = req.body;
    if (!orderId || !driverId) {
      return res.status(400).json({ success: false, message: "orderId and driverId are required" });
    }

    const [order, driver] = await Promise.all([
      Order.findById(orderId),
      User.findOne({ _id: driverId, role: "delivery" }),
    ]);

    if (!order)  return res.status(404).json({ success: false, message: "Order not found" });
    if (!driver) return res.status(404).json({ success: false, message: "Driver not found" });
    if (!["confirmed", "processing"].includes(order.status)) {
      return res.status(400).json({ success: false, message: "Cannot assign driver to this order status" });
    }
    if (driver.driverStatus === "busy") {
      return res.status(400).json({ success: false, message: "Driver is currently busy with another order" });
    }

    order.driver = driverId;
    order.status = "shipped";
    order.trackingHistory.push({
      status:    "shipped",
      note:      `Driver ${driver.name} assigned`,
      updatedBy: req.user._id,
      timestamp: new Date(),
    });
    await order.save();

    // Mark driver as busy
    await User.findByIdAndUpdate(driverId, { driverStatus: "busy" });

    // Notify driver
    createNotification({
      userId: driverId,
      type:   "order",
      title:  "New Delivery Assigned",
      body:   `You have been assigned order ${order.orderNumber}`,
      data:   { orderId: order._id, orderNumber: order.orderNumber },
    }).catch(() => {});

    // Notify customer
    createNotification({
      userId: order.user,
      type:   "order",
      title:  "Order Shipped",
      body:   `Your order ${order.orderNumber} is on the way with driver ${driver.name}`,
      data:   { orderId: order._id, orderNumber: order.orderNumber },
    }).catch(() => {});

    const populated = await Order.findById(order._id)
      .populate("driver", "name phone driverStatus driverLocation");
    res.json({ success: true, order: populated });
  } catch (err) {
    next(err);
  }
};

// ── Driver: Get My Deliveries ─────────────────────────────────────────────────
exports.getMyDeliveries = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = { driver: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate("user", "name phone")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments(filter),
    ]);

    res.json({ success: true, orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

// ── Driver: Mark Delivered ────────────────────────────────────────────────────
exports.markDelivered = async (req, res, next) => {
  try {
    const order = await Order.findOne({
      _id:    req.params.orderId,
      driver: req.user._id,
      status: "shipped",
    });
    if (!order) return res.status(404).json({ success: false, message: "Order not found or not assigned to you" });

    order.status       = "delivered";
    order.deliveredAt  = new Date();
    order.paymentStatus = "paid";
    order.trackingHistory.push({
      status:    "delivered",
      note:      "Delivered by driver",
      updatedBy: req.user._id,
      timestamp: new Date(),
    });
    await order.save();

    // Mark COD payment as completed (upsert in case record wasn't pre-created)
    if (order.paymentMethod === "cash") {
      await Payment.findOneAndUpdate(
        { order: order._id, method: "cash" },
        {
          $set:         { status: "completed", paidAt: new Date() },
          $setOnInsert: { user: order.user, amount: order.total, currency: "SAR" },
        },
        { upsert: true, new: true }
      );
    }

    // Free the driver
    await User.findByIdAndUpdate(req.user._id, { driverStatus: "available" });

    // Notify customer
    createNotification({
      userId: order.user,
      type:   "order",
      title:  "Order Delivered",
      body:   `Your order ${order.orderNumber} has been delivered successfully`,
      data:   { orderId: order._id, orderNumber: order.orderNumber },
    }).catch(() => {});

    res.json({ success: true, message: "Order marked as delivered" });
  } catch (err) {
    next(err);
  }
};

// ── Driver: Update Location ───────────────────────────────────────────────────
exports.updateDriverLocation = async (req, res, next) => {
  try {
    const { lat, lng } = req.body;
    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ success: false, message: "lat and lng are required" });
    }
    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ success: false, message: "lat and lng must be numbers" });
    }

    const driver = await User.findByIdAndUpdate(
      req.user._id,
      { driverLocation: { lat, lng, updatedAt: new Date() } },
      { new: true, select: "name driverStatus driverLocation" }
    );

    res.json({ success: true, location: driver.driverLocation });
  } catch (err) {
    next(err);
  }
};

// ── Driver: Update Status ─────────────────────────────────────────────────────
exports.updateDriverStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ["available", "busy", "offline"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Status must be one of: ${allowed.join(", ")}` });
    }

    // Prevent driver from self-marking busy if they have no active order
    if (status === "busy") {
      const activeOrder = await Order.findOne({ driver: req.user._id, status: "shipped" });
      if (!activeOrder) {
        return res.status(400).json({ success: false, message: "Cannot set status to busy without an active order" });
      }
    }

    await User.findByIdAndUpdate(req.user._id, { driverStatus: status });
    res.json({ success: true, driverStatus: status });
  } catch (err) {
    next(err);
  }
};

// ── Admin: List Available Drivers ─────────────────────────────────────────────
exports.getAvailableDrivers = async (req, res, next) => {
  try {
    const validStatuses = ["available", "busy", "offline"];
    const requestedStatus = req.query.status;
    const filter = { role: "delivery", isActive: true };

    if (requestedStatus && requestedStatus !== "all" && validStatuses.includes(requestedStatus)) {
      filter.driverStatus = requestedStatus;
    } else if (!requestedStatus) {
      filter.driverStatus = "available";
    }
    // "all" or unrecognised → no driverStatus filter (return all drivers)

    const drivers = await User.find(filter)
      .select("name phone driverStatus driverLocation lastLoginAt")
      .sort({ "driverLocation.updatedAt": -1 });

    res.json({ success: true, count: drivers.length, drivers });
  } catch (err) {
    next(err);
  }
};
