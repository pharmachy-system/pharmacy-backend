const express = require("express");
const router = express.Router();
const {
  getAllCoupons, getCouponById, validateCoupon, createCoupon, updateCoupon, deleteCoupon,
} = require("../controllers/coupon.controller");
const { protect } = require("../middleware/auth.middleware");
const authorize = require("../middleware/role.middleware");

router.post("/validate", protect, validateCoupon);
router.get("/", protect, authorize("admin"), getAllCoupons);
router.post("/", protect, authorize("admin"), createCoupon);
router.get("/:id", protect, authorize("admin"), getCouponById);
router.put("/:id", protect, authorize("admin"), updateCoupon);
router.delete("/:id", protect, authorize("admin"), deleteCoupon);

module.exports = router;
