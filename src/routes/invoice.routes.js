const express = require("express");
const router = express.Router({ mergeParams: true });
const { getOrderInvoice } = require("../controllers/invoice.controller");
const { protect } = require("../middlewares/auth.middleware");

// GET /api/orders/:id/invoice
router.get("/", protect, getOrderInvoice);

module.exports = router;
