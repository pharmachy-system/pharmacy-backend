const Cart = require("../models/Cart.model");
const Medicine = require("../models/Medicine.model");
const Coupon = require("../models/Coupon.model");
const DeliveryZone = require("../models/DeliveryZone.model");
const GuestSession = require("../models/GuestSession.model");
const User = require("../models/User.model");
const Wallet = require("../models/Wallet.model");

const getOrCreateCart = async (userId) => {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) cart = await Cart.create({ user: userId, items: [] });
  return cart;
};

// ─── Get Cart ─────────────────────────────────────────────────────────────────
exports.getCart = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id }).populate(
      "items.medicine",
      "name images finalPrice flashSalePrice isFlashSale stock requiresPrescription isActive"
    );

    if (!cart) return res.json({ success: true, cart: { items: [], subtotal: 0, itemCount: 0 } });

    // Filter out inactive/deleted medicines
    const activeItems = cart.items.filter((item) => item.medicine && item.medicine.isActive);

    // Compute current prices — use flash sale price when active
    let subtotal = 0;
    const items = activeItems.map((item) => {
      const currentPrice = item.medicine.isFlashSale && item.medicine.flashSalePrice
        ? item.medicine.flashSalePrice
        : item.medicine.finalPrice;
      subtotal += currentPrice * item.quantity;
      return { ...item.toObject(), price: currentPrice };
    });

    res.json({
      success: true,
      cart: {
        _id: cart._id,
        items,
        subtotal,
        couponDiscount: cart.couponDiscount || 0,
        total: subtotal - (cart.couponDiscount || 0),
        itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
        coupon: cart.coupon,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Add to Cart ──────────────────────────────────────────────────────────────
exports.addToCart = async (req, res, next) => {
  try {
    const { medicineId, quantity = 1 } = req.body;

    const medicine = await Medicine.findOne({ _id: medicineId, isActive: true });
    if (!medicine) return res.status(404).json({ success: false, message: "Medicine not found" });
    if (medicine.stock < quantity)
      return res.status(400).json({ success: false, message: "Insufficient stock" });

    const cart = await getOrCreateCart(req.user._id);
    const existingItem = cart.items.find((i) => i.medicine.toString() === medicineId);

    const activePrice = medicine.isFlashSale && medicine.flashSalePrice
      ? medicine.flashSalePrice
      : medicine.finalPrice;

    if (existingItem) {
      const newQty = existingItem.quantity + quantity;
      if (medicine.stock < newQty)
        return res.status(400).json({ success: false, message: "Insufficient stock" });
      existingItem.quantity = newQty;
      existingItem.price = activePrice;
    } else {
      cart.items.push({
        medicine: medicine._id,
        quantity,
        price: activePrice,
        name: medicine.name,
      });
    }

    await cart.save();
    await cart.populate("items.medicine", "name images finalPrice flashSalePrice isFlashSale stock requiresPrescription");
    res.json({ success: true, cart });
  } catch (err) {
    next(err);
  }
};

// ─── Update Cart Item ─────────────────────────────────────────────────────────
exports.updateCartItem = async (req, res, next) => {
  try {
    const { quantity } = req.body;
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ success: false, message: "Cart not found" });

    const item = cart.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ success: false, message: "Item not found in cart" });

    if (quantity <= 0) {
      item.deleteOne();
    } else {
      const medicine = await Medicine.findById(item.medicine);
      if (medicine && medicine.stock < quantity)
        return res.status(400).json({ success: false, message: "Insufficient stock" });
      item.quantity = quantity;
    }

    await cart.save();
    await cart.populate("items.medicine", "name images finalPrice flashSalePrice isFlashSale stock requiresPrescription");
    res.json({ success: true, cart });
  } catch (err) {
    next(err);
  }
};

// ─── Remove Cart Item ─────────────────────────────────────────────────────────
exports.removeFromCart = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ success: false, message: "Cart not found" });

    const item = cart.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ success: false, message: "Item not found" });

    item.deleteOne();
    await cart.save();
    res.json({ success: true, message: "Item removed", itemCount: cart.items.length });
  } catch (err) {
    next(err);
  }
};

// ─── Clear Cart ───────────────────────────────────────────────────────────────
exports.clearCart = async (req, res, next) => {
  try {
    await Cart.findOneAndUpdate(
      { user: req.user._id },
      { items: [], coupon: null, couponDiscount: 0 }
    );
    res.json({ success: true, message: "Cart cleared" });
  } catch (err) {
    next(err);
  }
};

// ─── Apply Coupon ─────────────────────────────────────────────────────────────
exports.applyCoupon = async (req, res, next) => {
  try {
    const { code } = req.body;
    const cart = await Cart.findOne({ user: req.user._id }).populate("items.medicine", "finalPrice");
    if (!cart || cart.items.length === 0)
      return res.status(400).json({ success: false, message: "Cart is empty" });

    const coupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (!coupon || !coupon.isValid())
      return res.status(400).json({ success: false, message: "Invalid or expired coupon" });

    // Check per-user usage
    const userUsageCount = coupon.usedBy.filter((id) => id.toString() === req.user._id.toString()).length;
    if (userUsageCount >= coupon.perUserLimit)
      return res.status(400).json({ success: false, message: "Coupon usage limit reached" });

    const subtotal = cart.items.reduce((sum, i) => sum + i.medicine.finalPrice * i.quantity, 0);
    if (subtotal < coupon.minOrderAmount)
      return res.status(400).json({
        success: false,
        message: `Minimum order amount is ${coupon.minOrderAmount} SAR`,
      });

    let discount = coupon.type === "percentage" ? (subtotal * coupon.value) / 100 : coupon.value;
    if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);

    cart.coupon = coupon._id;
    cart.couponDiscount = Math.round(discount * 100) / 100;
    await cart.save();

    res.json({
      success: true,
      message: "Coupon applied",
      discount: cart.couponDiscount,
      total: subtotal - cart.couponDiscount,
    });
  } catch (err) {
    next(err);
  }
};

// ─── Remove Coupon ────────────────────────────────────────────────────────────
exports.removeCoupon = async (req, res, next) => {
  try {
    await Cart.findOneAndUpdate({ user: req.user._id }, { coupon: null, couponDiscount: 0 });
    res.json({ success: true, message: "Coupon removed" });
  } catch (err) {
    next(err);
  }
};

// ─── Cart Count (badge) ───────────────────────────────────────────────────────
exports.getCartCount = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id }).select("items");
    const count = cart ? cart.items.reduce((sum, i) => sum + i.quantity, 0) : 0;
    res.json({ success: true, count });
  } catch (err) {
    next(err);
  }
};

// ─── Checkout Summary (preview totals before creating order) ──────────────────
// POST /api/cart/checkout-summary
// Body: { deliveryZoneId?, couponCode?, useLoyaltyPoints? }
exports.getCheckoutSummary = async (req, res, next) => {
  try {
    const { deliveryZoneId, couponCode, useLoyaltyPoints } = req.body;

    const cart = await Cart.findOne({ user: req.user._id }).populate(
      "items.medicine", "finalPrice flashSalePrice isFlashSale stock isActive requiresPrescription name"
    );

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const activeItems = cart.items.filter((i) => i.medicine?.isActive && i.medicine.stock >= i.quantity);
    if (activeItems.length === 0) {
      return res.status(400).json({ success: false, message: "No available items in cart" });
    }

    let subtotal = 0;
    const items = activeItems.map((item) => {
      const price = item.medicine.isFlashSale && item.medicine.flashSalePrice
        ? item.medicine.flashSalePrice
        : item.medicine.finalPrice;
      subtotal += price * item.quantity;
      return { name: item.medicine.name, quantity: item.quantity, price, total: price * item.quantity, requiresPrescription: item.medicine.requiresPrescription };
    });

    // Delivery fee
    let deliveryFee = 0;
    let zoneInfo = null;
    if (deliveryZoneId) {
      const zone = await DeliveryZone.findById(deliveryZoneId).select("name deliveryFee freeDeliveryThreshold minDeliveryTime maxDeliveryTime");
      if (zone) {
        deliveryFee = subtotal >= zone.freeDeliveryThreshold ? 0 : zone.deliveryFee;
        zoneInfo = { name: zone.name, deliveryFee, freeDeliveryThreshold: zone.freeDeliveryThreshold, estimatedDays: `${zone.minDeliveryTime}-${zone.maxDeliveryTime}` };
      }
    }

    // Coupon discount
    let couponDiscount = 0;
    let couponInfo = null;
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
      if (coupon && coupon.isValid()) {
        const userUsage = coupon.usedBy.filter((id) => id.toString() === req.user._id.toString()).length;
        if (userUsage < coupon.perUserLimit && subtotal >= coupon.minOrderAmount) {
          couponDiscount = coupon.type === "percentage" ? (subtotal * coupon.value) / 100 : coupon.value;
          if (coupon.maxDiscount) couponDiscount = Math.min(couponDiscount, coupon.maxDiscount);
          couponDiscount = Math.round(couponDiscount * 100) / 100;
          couponInfo = { code: coupon.code, type: coupon.type, value: coupon.value, discount: couponDiscount };
        }
      }
    }

    // Loyalty points discount
    let loyaltyDiscount = 0;
    const user = await User.findById(req.user._id).select("loyaltyPoints");
    if (useLoyaltyPoints && user.loyaltyPoints > 0) {
      loyaltyDiscount = Math.min(user.loyaltyPoints, Math.floor(subtotal * 0.1));
    }

    // Wallet balance (informational)
    const wallet = await Wallet.findOne({ user: req.user._id }).select("balance");

    const total = Math.max(0, subtotal + deliveryFee - couponDiscount - loyaltyDiscount);

    res.json({
      success: true,
      summary: {
        items,
        subtotal: Math.round(subtotal * 100) / 100,
        deliveryFee,
        couponDiscount,
        loyaltyDiscount,
        total: Math.round(total * 100) / 100,
        zone: zoneInfo,
        coupon: couponInfo,
        loyaltyPointsAvailable: user.loyaltyPoints,
        walletBalance: wallet?.balance ?? 0,
        requiresPrescription: items.some((i) => i.requiresPrescription),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Merge Guest Cart ─────────────────────────────────────────────────────────
// POST /api/cart/merge-guest
// Body: { guestId }
// Called after login when the user had an active guest session.
exports.mergeGuestCart = async (req, res, next) => {
  try {
    const { guestId } = req.body;
    if (!guestId) return res.status(400).json({ success: false, message: "guestId is required" });

    const guestSession = await GuestSession.findOne({ guestId });
    if (!guestSession || guestSession.cart.length === 0) {
      return res.json({ success: true, message: "No guest cart to merge", merged: 0 });
    }

    const userCart = await getOrCreateCart(req.user._id);
    let merged = 0;

    for (const guestItem of guestSession.cart) {
      const medicine = await Medicine.findOne({ _id: guestItem.medicine, isActive: true });
      if (!medicine || medicine.stock < 1) continue;

      const existing = userCart.items.find((i) => i.medicine.toString() === guestItem.medicine.toString());
      const price = medicine.isFlashSale && medicine.flashSalePrice ? medicine.flashSalePrice : medicine.finalPrice;

      if (existing) {
        const newQty = existing.quantity + guestItem.quantity;
        existing.quantity = Math.min(newQty, medicine.stock);
        existing.price = price;
      } else {
        userCart.items.push({
          medicine: medicine._id,
          quantity: Math.min(guestItem.quantity, medicine.stock),
          price,
          name: medicine.name,
        });
      }
      merged++;
    }

    await userCart.save();

    // Expire the guest session after merge
    await GuestSession.deleteOne({ guestId });

    res.json({ success: true, message: `Merged ${merged} item(s) from guest cart`, merged, itemCount: userCart.items.length });
  } catch (err) {
    next(err);
  }
};
