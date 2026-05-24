const Order = require("../models/Order.model");
const Medicine = require("../models/Medicine.model");

// GET /api/reports/sales?startDate=&endDate=
exports.getSalesReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = { paymentStatus: "paid" };

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const orders = await Order.find(filter)
      .populate("user", "name email")
      .populate("items.medicine", "name")
      .sort("-createdAt");

    const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);

    res.json({
      success: true,
      data: {
        totalOrders: orders.length,
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        orders,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/reports/inventory
exports.getInventoryReport = async (req, res, next) => {
  try {
    const medicines = await Medicine.find({ isActive: true }).populate("category", "name");

    const totalItems = medicines.length;
    const totalValue = medicines.reduce((sum, m) => sum + (m.price || 0) * (m.stock || 0), 0);
    const lowStockCount = medicines.filter((m) => (m.stock || 0) <= (m.lowStockThreshold || 10)).length;
    const expiredCount = medicines.filter((m) => m.expiryDate && m.expiryDate < new Date()).length;

    res.json({
      success: true,
      data: { totalItems, totalValue: parseFloat(totalValue.toFixed(2)), lowStockCount, expiredCount, medicines },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/reports/low-stock
exports.getLowStockReport = async (req, res, next) => {
  try {
    const medicines = await Medicine.find({
      isActive: true,
      $expr: { $lte: ["$stock", "$lowStockThreshold"] },
    })
      .populate("category", "name")
      .sort("stock");

    res.json({ success: true, count: medicines.length, data: medicines });
  } catch (err) {
    next(err);
  }
};

// GET /api/reports/revenue (monthly breakdown, last 12 months)
exports.getRevenueByPeriod = async (req, res, next) => {
  try {
    const revenue = await Order.aggregate([
      { $match: { paymentStatus: "paid" } },
      {
        $group: {
          _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
          revenue: { $sum: "$total" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 12 },
    ]);

    res.json({ success: true, data: revenue });
  } catch (err) {
    next(err);
  }
};

// GET /api/reports/top-medicines?limit=10
exports.getTopMedicines = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;

    const topMedicines = await Order.aggregate([
      { $match: { status: { $nin: ["cancelled", "refunded"] } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.medicine",
          name: { $first: "$items.name" },
          totalSold: { $sum: "$items.quantity" },
          totalRevenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } },
        },
      },
      { $sort: { totalSold: -1 } },
      { $limit: limit },
      { $lookup: { from: "medicines", localField: "_id", foreignField: "_id", as: "medicine" } },
      { $unwind: { path: "$medicine", preserveNullAndEmptyArrays: true } },
      { $project: { name: 1, totalSold: 1, totalRevenue: 1, image: { $arrayElemAt: ["$medicine.images.url", 0] } } },
    ]);

    res.json({ success: true, data: topMedicines });
  } catch (err) {
    next(err);
  }
};
