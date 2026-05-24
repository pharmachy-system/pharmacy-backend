const express = require("express");
const router = express.Router();
const {
  getStats, getRevenueByPeriod, getTopProducts, getOrderStatusBreakdown,
  getUserTrend, getRecentOrders, getSalesReport,
} = require("../../controllers/admin/dashboard.controller");
const { protect } = require("../../middlewares/auth.middleware");
const authorize = require("../../middlewares/role.middleware");

router.use(protect, authorize("admin", "pharmacist"));

router.get("/stats", getStats);
router.get("/revenue", getRevenueByPeriod);
router.get("/top-products", getTopProducts);
router.get("/order-breakdown", getOrderStatusBreakdown);
router.get("/user-trend", getUserTrend);
router.get("/recent-orders", getRecentOrders);
router.get("/sales-report", getSalesReport);

module.exports = router;
