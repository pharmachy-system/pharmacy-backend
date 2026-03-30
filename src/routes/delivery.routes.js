const express = require("express");
const router = express.Router();
const {
  getAllZones, getZoneById, createZone, updateZone, deleteZone,
  calculateFee, assignDriver, getMyDeliveries, markDelivered,
} = require("../controllers/delivery.controller");
const { protect } = require("../middleware/auth.middleware");
const authorize = require("../middleware/role.middleware");

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
router.post("/zones", authorize("admin"), createZone);
router.put("/zones/:id", authorize("admin"), updateZone);
router.delete("/zones/:id", authorize("admin"), deleteZone);
router.post("/assign-driver", authorize("admin", "pharmacist"), assignDriver);

module.exports = router;
