const express = require("express");
const router = express.Router();
const {
  getAllZones, getZoneById, createZone, updateZone, deleteZone,
  calculateFee, assignDriver, getMyDeliveries, markDelivered,
} = require("../controllers/delivery.controller");
const { protect } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/role.middleware");
const { joiValidate } = require("../middlewares/joiValidate.middleware");
const { schemas } = require("../validators/joi.validators");
const { strictLimiter } = require("../middlewares/rateLimiter");

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/zones", getAllZones);
router.post("/calculate-fee", calculateFee);

// ── Protected ─────────────────────────────────────────────────────────────────
router.use(protect);

// Driver routes
router.get("/my-deliveries", authorize("delivery"), getMyDeliveries);
router.patch("/orders/:orderId/delivered", authorize("delivery"), markDelivered);

// Admin routes
router.get("/zones/:id", getZoneById);
router.post("/zones", strictLimiter, authorize("admin"), joiValidate(schemas.deliveryZone.create), createZone);
router.put("/zones/:id", strictLimiter, authorize("admin"), joiValidate(schemas.deliveryZone.create), updateZone);
router.delete("/zones/:id", strictLimiter, authorize("admin"), deleteZone);
router.post("/assign-driver", authorize("admin", "pharmacist"), assignDriver);

module.exports = router;
