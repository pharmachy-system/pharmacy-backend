/**
 * Guest Session Controller
 *
 * Allows unauthenticated users to:
 *   - Browse products
 *   - Maintain a cart
 *   - Be prompted to sign up when they try to checkout / access wishlist
 *
 * On conversion (create account), the guest cart is merged into the user cart.
 *
 * Endpoints:
 *   POST   /api/auth/guest/session            → create guest session
 *   GET    /api/auth/guest/:guestId           → get guest session + cart
 *   POST   /api/auth/guest/:guestId/cart      → add item to guest cart
 *   PUT    /api/auth/guest/:guestId/cart/:mid → update quantity
 *   DELETE /api/auth/guest/:guestId/cart/:mid → remove item
 *   POST   /api/auth/guest/convert            → convert guest → user + merge cart
 */

const { randomUUID: uuidv4 } = require("crypto");
const GuestSession = require("../models/GuestSession.model");
const User = require("../models/User.model");
const Medicine = require("../models/Medicine.model");
const Cart = require("../models/Cart.model");
const { extractDeviceInfo, upsertSession } = require("../utils/session.util");
const { generateAccessToken, generateRefreshToken } = require("../utils/token.util");

// ─── Create guest session ─────────────────────────────────────────────────────
// Internal helper used by both POST /guest/session and POST /guest
async function _createGuestSession(req, res, next) {
  const { deviceId } = req.body;
  const guestId = uuidv4();

  await GuestSession.create({
    guestId,
    cart:      [],
    deviceId:  deviceId || null,
    ipAddress: req.ip,
  });

  res.status(201).json({
    success:    true,
    guestId,
    guestToken: guestId, // alias — clients may use either field name
    userType:   "guest",
    message:    "Guest session created. You can browse products and add items to cart.",
    expiresIn:  "7 days",
  });
}

exports.createSession = async (req, res, next) => {
  try {
    await _createGuestSession(req, res, next);
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/guest  — short alias matching the diagram spec
exports.createGuestAlias = async (req, res, next) => {
  try {
    await _createGuestSession(req, res, next);
  } catch (err) {
    next(err);
  }
};

// ─── Get guest session ────────────────────────────────────────────────────────
exports.getSession = async (req, res, next) => {
  try {
    const session = await GuestSession.findOne({ guestId: req.params.guestId })
      .populate("cart.medicine", "name images price finalPrice isActive stock");

    if (!session) {
      return res.status(404).json({ success: false, message: "Guest session not found or expired" });
    }

    // Calculate cart totals
    const cartTotal = session.cart.reduce(
      (sum, item) => sum + (item.medicine?.finalPrice || item.price || 0) * item.quantity, 0
    );

    res.json({
      success: true,
      guestId:   session.guestId,
      cart:      session.cart,
      cartTotal,
      itemCount: session.cart.reduce((n, i) => n + i.quantity, 0),
      expiresAt: session.expiresAt,
    });
  } catch (err) {
    next(err);
  }
};

// ─── Add item to guest cart ───────────────────────────────────────────────────
exports.addToCart = async (req, res, next) => {
  try {
    const { guestId } = req.params;
    const { medicineId, quantity = 1 } = req.body;

    if (!medicineId) return res.status(400).json({ success: false, message: "medicineId is required" });

    const session = await GuestSession.findOne({ guestId });
    if (!session) return res.status(404).json({ success: false, message: "Guest session not found" });

    const medicine = await Medicine.findOne({ _id: medicineId, isActive: true });
    if (!medicine) return res.status(404).json({ success: false, message: "Medicine not found" });
    if (medicine.stock < quantity) {
      return res.status(400).json({ success: false, message: "Insufficient stock" });
    }
    if (medicine.requiresPrescription) {
      return res.status(400).json({
        success: false,
        message: "This medicine requires a prescription. Please log in to upload one.",
        requiresLogin: true,
      });
    }

    const existing = session.cart.find((i) => i.medicine?.toString() === medicineId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      session.cart.push({
        medicine: medicine._id,
        quantity,
        price: medicine.finalPrice ?? medicine.price,
        name:  medicine.name,
        image: medicine.images?.[0]?.url || "",
      });
    }

    await session.save();

    res.json({
      success: true,
      message: "Item added to cart",
      cartItemCount: session.cart.reduce((n, i) => n + i.quantity, 0),
    });
  } catch (err) {
    next(err);
  }
};

// ─── Update guest cart item quantity ─────────────────────────────────────────
exports.updateCartItem = async (req, res, next) => {
  try {
    const { guestId, medicineId } = req.params;
    const { quantity } = req.body;

    if (typeof quantity !== "number" || quantity < 0) {
      return res.status(400).json({ success: false, message: "quantity must be a non-negative number" });
    }

    const session = await GuestSession.findOne({ guestId });
    if (!session) return res.status(404).json({ success: false, message: "Guest session not found" });

    if (quantity === 0) {
      session.cart = session.cart.filter((i) => i.medicine?.toString() !== medicineId);
    } else {
      const item = session.cart.find((i) => i.medicine?.toString() === medicineId);
      if (!item) return res.status(404).json({ success: false, message: "Item not in cart" });
      item.quantity = quantity;
    }

    await session.save();
    res.json({ success: true, message: "Cart updated" });
  } catch (err) {
    next(err);
  }
};

// ─── Remove item from guest cart ──────────────────────────────────────────────
exports.removeFromCart = async (req, res, next) => {
  try {
    const { guestId, medicineId } = req.params;

    const session = await GuestSession.findOne({ guestId });
    if (!session) return res.status(404).json({ success: false, message: "Guest session not found" });

    session.cart = session.cart.filter((i) => i.medicine?.toString() !== medicineId);
    await session.save();

    res.json({ success: true, message: "Item removed from cart" });
  } catch (err) {
    next(err);
  }
};

// ─── Convert guest to registered user + merge cart ───────────────────────────
exports.convert = async (req, res, next) => {
  try {
    const { guestId, name, email, password, phone, referralCode } = req.body;

    if (!guestId || !name || !email || !password) {
      return res.status(400).json({ success: false, message: "guestId, name, email, and password are required" });
    }

    const guestSession = await GuestSession.findOne({ guestId });
    if (!guestSession) {
      return res.status(404).json({ success: false, message: "Guest session not found or expired" });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ success: false, message: "Email already registered" });
    }

    const userData = { name, email, password, phone };
    if (referralCode) {
      const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
      if (referrer) userData.referredBy = referrer._id;
    }

    const user = await User.create(userData);

    // ── Merge guest cart into user cart ──────────────────────────────────────
    if (guestSession.cart.length > 0) {
      let cart = await Cart.findOne({ user: user._id });
      if (!cart) cart = await Cart.create({ user: user._id, items: [] });

      for (const guestItem of guestSession.cart) {
        const medicine = await Medicine.findOne({ _id: guestItem.medicine, isActive: true });
        if (!medicine || medicine.requiresPrescription) continue;

        const existing = cart.items.find(
          (ci) => ci.medicine?.toString() === guestItem.medicine?.toString()
        );
        if (existing) {
          existing.quantity += guestItem.quantity;
        } else {
          cart.items.push({
            medicine: guestItem.medicine,
            quantity: guestItem.quantity,
            price:    medicine.finalPrice,
            name:     medicine.name,
          });
        }
      }
      await cart.save();
    }

    // Delete guest session
    await GuestSession.deleteOne({ guestId });

    const accessToken  = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    const now = new Date();
    user.refreshToken = refreshToken;
    user.lastLogin    = now;
    user.lastLoginAt  = now;
    user.loginCount   = 1;
    await user.save({ validateBeforeSave: false });

    const deviceInfo = extractDeviceInfo(req);
    await upsertSession(user._id, refreshToken, deviceInfo, req);

    res.status(201).json({
      success:    true,
      message:    "Account created and cart merged successfully",
      accessToken,
      refreshToken,
      user: {
        id:             user._id,
        name:           user.name,
        email:          user.email,
        role:           user.role,
        userType:       "patient",
        isReturningUser: false,
        loginCount:     1,
        lastLoginAt:    now,
      },
      cartMerged: guestSession.cart.length > 0,
    });
  } catch (err) {
    next(err);
  }
};
