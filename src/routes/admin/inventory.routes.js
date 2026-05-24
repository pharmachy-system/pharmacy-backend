const express = require("express");
const router = express.Router();
const {
  getInventorySummary, getLowStockReport, getExpiryReport,
  getStockMovement, bulkUpdateStock,
} = require("../../controllers/admin/inventory.controller");
const { protect } = require("../../middlewares/auth.middleware");
const authorize = require("../../middlewares/role.middleware");

router.use(protect, authorize("admin", "pharmacist"));

router.get("/summary", getInventorySummary);
router.get("/low-stock", getLowStockReport);
router.get("/expiry", getExpiryReport);
router.get("/movement", getStockMovement);
router.post("/bulk-stock", authorize("admin"), bulkUpdateStock);

module.exports = router;
