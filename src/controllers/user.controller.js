const User    = require("../models/User.model");
const Wallet  = require("../models/Wallet.model");
const Session = require("../models/Session.model");
const { uploadToCloudinary, deleteFromCloudinary } = require("../utils/cloudinary.util");

// ─── Get Profile ──────────────────────────────────────────────────────────────
exports.getProfile = async (req, res, next) => {
  try {
    const [user, wallet] = await Promise.all([
      User.findById(req.user._id),
      Wallet.findOne({ user: req.user._id }).select("balance"),
    ]);
    res.json({ success: true, user, walletBalance: wallet?.balance ?? 0 });
  } catch (err) {
    next(err);
  }
};

// ─── Update Profile ───────────────────────────────────────────────────────────
exports.updateProfile = async (req, res, next) => {
  try {
    const allowed = ["name", "phone", "fcmToken"];
    const updates = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

// ─── Upload Avatar ────────────────────────────────────────────────────────────
exports.uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No image uploaded" });

    const user = await User.findById(req.user._id);

    // Delete old avatar from Cloudinary
    if (user.avatar) {
      const publicId = user.avatar.split("/").slice(-1)[0].split(".")[0];
      await deleteFromCloudinary(`pharmacy/avatars/${publicId}`);
    }

    const result = await uploadToCloudinary(req.file.buffer, "avatars", {
      width: 300,
      height: 300,
      crop: "fill",
      gravity: "face",
    });

    user.avatar = result.secure_url;
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, avatar: result.secure_url });
  } catch (err) {
    next(err);
  }
};

// ─── Change Password ──────────────────────────────────────────────────────────
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select("+password");

    if (!(await user.matchPassword(currentPassword))) {
      return res.status(400).json({ success: false, message: "Current password is incorrect" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    }

    user.password     = newPassword;
    user.refreshToken = null;
    await user.save();

    // Revoke all active device sessions
    await Session.updateMany({ user: user._id }, { isActive: false, refreshTokenHash: null });

    res.json({ success: true, message: "Password changed. Please log in again." });
  } catch (err) {
    next(err);
  }
};

// ─── Addresses ────────────────────────────────────────────────────────────────
exports.getAddresses = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("addresses");
    res.json({ success: true, addresses: user.addresses });
  } catch (err) {
    next(err);
  }
};

exports.addAddress = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (user.addresses.length >= 10) {
      return res.status(400).json({ success: false, message: "Maximum 10 addresses allowed" });
    }

    const newAddress = req.body;

    // If this is set as default, unset previous default
    if (newAddress.isDefault) {
      user.addresses.forEach((addr) => { addr.isDefault = false; });
    }
    // First address is always default
    if (user.addresses.length === 0) newAddress.isDefault = true;

    user.addresses.push(newAddress);
    await user.save({ validateBeforeSave: false });

    res.status(201).json({ success: true, addresses: user.addresses });
  } catch (err) {
    next(err);
  }
};

exports.updateAddress = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const address = user.addresses.id(req.params.addressId);
    if (!address) return res.status(404).json({ success: false, message: "Address not found" });

    if (req.body.isDefault) {
      user.addresses.forEach((addr) => { addr.isDefault = false; });
    }

    Object.assign(address, req.body);
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, addresses: user.addresses });
  } catch (err) {
    next(err);
  }
};

exports.deleteAddress = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const address = user.addresses.id(req.params.addressId);
    if (!address) return res.status(404).json({ success: false, message: "Address not found" });

    address.deleteOne();
    // Ensure at least one default
    if (user.addresses.length > 0 && !user.addresses.some((a) => a.isDefault)) {
      user.addresses[0].isDefault = true;
    }
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, addresses: user.addresses });
  } catch (err) {
    next(err);
  }
};

exports.setDefaultAddress = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const address = user.addresses.id(req.params.addressId);
    if (!address) return res.status(404).json({ success: false, message: "Address not found" });

    user.addresses.forEach((addr) => { addr.isDefault = false; });
    address.isDefault = true;
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, addresses: user.addresses });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: List Users ────────────────────────────────────────────────────────
exports.getAllUsers = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === "true";
    if (req.query.search) {
      const escaped = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { email: { $regex: escaped, $options: "i" } },
        { phone: { $regex: escaped, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      users,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.getUserById = async (req, res, next) => {
  try {
    const [user, wallet] = await Promise.all([
      User.findById(req.params.id),
      Wallet.findOne({ user: req.params.id }).select("balance"),
    ]);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, user, walletBalance: wallet?.balance ?? 0 });
  } catch (err) {
    next(err);
  }
};

exports.updateUserStatus = async (req, res, next) => {
  try {
    const { isActive, blockedReason } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive, blockedReason: isActive ? undefined : blockedReason },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

exports.updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    const validRoles = ["customer", "pharmacist", "admin", "delivery"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: Soft-delete user ──────────────────────────────────────────────────
exports.deleteUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: "Cannot delete your own account" });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false, blockedReason: "Account deleted by admin" },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    await Session.updateMany({ user: user._id }, { isActive: false, refreshTokenHash: null });
    res.json({ success: true, message: "User account deactivated" });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: Force-reset user password ────────────────────────────────────────
exports.adminResetUserPassword = async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ success: false, message: "newPassword must be at least 8 characters" });
    }
    const user = await User.findById(req.params.id).select("+password");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    user.password     = newPassword;
    user.refreshToken = null;
    await user.save();

    await Session.updateMany({ user: user._id }, { isActive: false, refreshTokenHash: null });

    res.json({ success: true, message: "User password reset successfully" });
  } catch (err) {
    next(err);
  }
};

// ─── Update FCM Token ─────────────────────────────────────────────────────────
exports.updateFcmToken = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { fcmToken: req.body.fcmToken });
    res.json({ success: true, message: "FCM token updated" });
  } catch (err) {
    next(err);
  }
};

// ─── Loyalty Points ───────────────────────────────────────────────────────────
exports.getLoyaltyPoints = async (req, res, next) => {
  try {
    const LoyaltyTransaction = require("../models/LoyaltyTransaction.model");
    const user = await User.findById(req.user._id).select("loyaltyPoints");

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      LoyaltyTransaction.find({ user: req.user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      LoyaltyTransaction.countDocuments({ user: req.user._id }),
    ]);

    res.json({
      success: true,
      balance: user.loyaltyPoints,
      transactions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};
