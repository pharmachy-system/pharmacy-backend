const express = require("express");
const router = express.Router();
const {
  getProfile, updateProfile, uploadAvatar, changePassword,
  getAddresses, addAddress, updateAddress, deleteAddress, setDefaultAddress,
  getAllUsers, getUserById, updateUserStatus, updateUserRole, getLoyaltyPoints,
} = require("../controllers/user.controller");
const { protect } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/role.middleware");
const { upload } = require("../utils/cloudinary.util");

// ── Current user ──────────────────────────────────────────────────────────────
router.get("/me", protect, getProfile);
router.put("/me", protect, updateProfile);
router.post("/me/avatar", protect, upload.single("avatar"), uploadAvatar);
router.put("/me/change-password", protect, changePassword);
router.get("/me/loyalty", protect, getLoyaltyPoints);

// ── Addresses ─────────────────────────────────────────────────────────────────
router.get("/me/addresses", protect, getAddresses);
router.post("/me/addresses", protect, addAddress);
router.put("/me/addresses/:addressId", protect, updateAddress);
router.delete("/me/addresses/:addressId", protect, deleteAddress);
router.patch("/me/addresses/:addressId/default", protect, setDefaultAddress);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.get("/", protect, authorize("admin"), getAllUsers);
router.get("/:id", protect, authorize("admin", "pharmacist"), getUserById);
router.patch("/:id/status", protect, authorize("admin"), updateUserStatus);
router.patch("/:id/role", protect, authorize("admin"), updateUserRole);

module.exports = router;
