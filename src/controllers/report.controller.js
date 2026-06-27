const Order = require("../models/Order.model");
const Medicine = require("../models/Medicine.model");

// GET /api/reports/sales?startDate=&endDate=&page=&limit=
exports.getSalesReport = async (req, res, next) => {
  try {
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate   = typeof req.query.endDate   === "string" ? req.query.endDate   : undefined;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const filter = { paymentStatus: "paid" };
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const [orders, total, [agg]] = await Promise.all([
      Order.find(filter)
        .populate("user", "name email")
        .populate("items.medicine", "name")
        .sort("-createdAt")
        .skip(skip)
        .limit(limit),
      Order.countDocuments(filter),
      Order.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$total" },
            totalDiscount: { $sum: "$couponDiscount" },
            avgOrderValue: { $avg: "$total" },
          },
        },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        totalOrders: total,
        totalRevenue: parseFloat((agg?.totalRevenue || 0).toFixed(2)),
        totalDiscount: parseFloat((agg?.totalDiscount || 0).toFixed(2)),
        avgOrderValue: parseFloat((agg?.avgOrderValue || 0).toFixed(2)),
        orders,
      },
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/reports/inventory?page=&limit=
exports.getInventoryReport = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const skip  = (page - 1) * limit;

    const now = new Date();

    const [[stats], medicines, total] = await Promise.all([
      Medicine.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id:          null,
            totalItems:   { $sum: 1 },
            totalValue:   { $sum: { $multiply: ["$price", "$stock"] } },
            lowStockCount: {
              $sum: { $cond: [{ $lte: ["$stock", { $ifNull: ["$lowStockThreshold", 10] }] }, 1, 0] },
            },
            expiredCount: {
              $sum: { $cond: [{ $and: [{ $ne: ["$expiryDate", null] }, { $lt: ["$expiryDate", now] }] }, 1, 0] },
            },
          },
        },
      ]),
      Medicine.find({ isActive: true })
        .populate("category", "name")
        .sort({ stock: 1 })
        .skip(skip)
        .limit(limit)
        .select("name stock price lowStockThreshold expiryDate category"),
      Medicine.countDocuments({ isActive: true }),
    ]);

    res.json({
      success: true,
      data: {
        totalItems:    stats?.totalItems   ?? 0,
        totalValue:    parseFloat((stats?.totalValue   ?? 0).toFixed(2)),
        lowStockCount: stats?.lowStockCount ?? 0,
        expiredCount:  stats?.expiredCount  ?? 0,
        medicines,
      },
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
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
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 10);

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
