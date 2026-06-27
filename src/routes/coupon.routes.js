const express = require("express");
const router = express.Router();
const {
  getAllCoupons, getCouponById, validateCoupon, createCoupon, updateCoupon, deleteCoupon,
} = require("../controllers/coupon.controller");
const { protect } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/role.middleware");
const { joiValidate } = require("../middlewares/joiValidate.middleware");
const { schemas } = require("../validators/joi.validators");

router.post("/validate", protect, validateCoupon);
router.get("/", protect, authorize("admin"), getAllCoupons);
router.post("/", protect, authorize("admin"), joiValidate(schemas.coupon.create), createCoupon);
router.get("/:id", protect, authorize("admin"), getCouponById);
router.put("/:id", protect, authorize("admin"), joiValidate(schemas.coupon.update), updateCoupon);
router.delete("/:id", protect, authorize("admin"), deleteCoupon);

module.exports = router;
