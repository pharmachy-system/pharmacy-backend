const express = require("express");
const router = express.Router();
const {
  getAllOrders, getOrderById, getUserOrders, createOrder,
  updateOrderStatus, cancelOrder, reorder, trackOrder,
} = require("../controllers/order.controller");
const { protect }     = require("../middlewares/auth.middleware");
const authorize       = require("../middlewares/role.middleware");
const { joiValidate } = require("../middlewares/joiValidate.middleware");
const { schemas }     = require("../validators/joi.validators");

router.use(protect);

router.get("/my-orders", getUserOrders);
router.get("/", authorize("admin", "pharmacist"), getAllOrders);
router.post("/", authorize("customer", "admin"), joiValidate(schemas.order.create), createOrder);
router.get("/:id", getOrderById);
router.get("/:id/track", trackOrder);
router.put("/:id/status", authorize("admin", "pharmacist"), joiValidate(schemas.order.updateStatus), updateOrderStatus);
router.put("/:id/cancel", joiValidate(schemas.order.cancel), cancelOrder);
router.post("/:id/reorder", reorder);

module.exports = router;
