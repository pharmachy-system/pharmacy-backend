const express = require("express");
const router = express.Router();
const {
  getProfile, updateProfile, uploadAvatar, changePassword,
  getAddresses, addAddress, updateAddress, deleteAddress, setDefaultAddress,
  getAllUsers, getUserById, updateUserStatus, updateUserRole, getLoyaltyPoints,
  deleteUser, adminResetUserPassword, updateFcmToken, getRecentlyViewed,
} = require("../controllers/user.controller");
const { protect } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/role.middleware");
const { upload } = require("../utils/cloudinary.util");
const { joiValidate } = require("../middlewares/joiValidate.middleware");
const { schemas } = require("../validators/joi.validators");
const { strictLimiter } = require("../middlewares/rateLimiter");

// ── Current user ──────────────────────────────────────────────────────────────
router.get("/me", protect, getProfile);
router.put("/me", protect, joiValidate(schemas.user.updateProfile), updateProfile);
router.post("/me/avatar", protect, upload.single("avatar"), uploadAvatar);
router.put("/me/change-password", protect, changePassword);
router.get("/me/loyalty",          protect, getLoyaltyPoints);
router.get("/me/recently-viewed",  protect, getRecentlyViewed);
router.patch("/me/fcm-token", protect, joiValidate(schemas.user.updateFcmToken), updateFcmToken);

// ── Addresses ─────────────────────────────────────────────────────────────────
router.get("/me/addresses", protect, getAddresses);
router.post("/me/addresses", protect, joiValidate(schemas.user.addAddress), addAddress);
router.put("/me/addresses/:addressId", protect, joiValidate(schemas.user.updateAddress), updateAddress);
router.delete("/me/addresses/:addressId", protect, deleteAddress);
router.patch("/me/addresses/:addressId/default", protect, setDefaultAddress);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.get("/",    protect, authorize("admin"), getAllUsers);
router.get("/:id", protect, authorize("admin", "pharmacist"), getUserById);
router.patch("/:id/status",         protect, strictLimiter, authorize("admin"), updateUserStatus);
router.patch("/:id/role",           protect, strictLimiter, authorize("admin"), updateUserRole);
router.delete("/:id",               protect, strictLimiter, authorize("admin"), deleteUser);
router.patch("/:id/reset-password", protect, strictLimiter, authorize("admin"), adminResetUserPassword);

module.exports = router;
