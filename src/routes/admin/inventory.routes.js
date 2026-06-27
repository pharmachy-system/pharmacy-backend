const express = require("express");
const router = express.Router();
const {
  getInventorySummary, getLowStockReport, getExpiryReport,
  getStockMovement, bulkUpdateStock, bulkUpdateStatus,
} = require("../../controllers/admin/inventory.controller");
const { protect } = require("../../middlewares/auth.middleware");
const authorize = require("../../middlewares/role.middleware");
const { audit } = require("../../middlewares/audit.middleware");

router.use(protect, authorize("admin", "pharmacist"));

router.get("/summary",    getInventorySummary);
router.get("/low-stock",  getLowStockReport);
router.get("/expiry",     getExpiryReport);
router.get("/movement",   getStockMovement);
router.post("/bulk-stock",  authorize("admin"), audit("BULK_STOCK_UPDATE",  "Medicine"), bulkUpdateStock);
router.post("/bulk-status", authorize("admin"), audit("BULK_STATUS_UPDATE", "Medicine"), bulkUpdateStatus);

module.exports = router;
