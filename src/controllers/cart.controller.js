const Cart = require("../models/Cart.model");
const Medicine = require("../models/Medicine.model");
const Coupon = require("../models/Coupon.model");

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
