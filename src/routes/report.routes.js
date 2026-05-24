const express = require("express");
const router = express.Router();

const { protect } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/role.middleware");
const {
  getSalesReport,
  getInventoryReport,
  getLowStockReport,
  getRevenueByPeriod,
  getTopMedicines,
} = require("../controllers/report.controller");

// All report routes require admin access
router.use(protect, authorize("admin"));

router.get("/sales", getSalesReport);
router.get("/inventory", getInventoryReport);
router.get("/low-stock", getLowStockReport);
router.get("/revenue", getRevenueByPeriod);
router.get("/top-medicines", getTopMedicines);

module.exports = router;
