const Order = require("../../models/Order.model");
const User = require("../../models/User.model");
const Medicine = require("../../models/Medicine.model");
const Payment = require("../../models/Payment.model");

// ─── Overview Stats ───────────────────────────────────────────────────────────
exports.getStats = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    const [
      totalOrders,
      todayOrders,
      thisMonthOrders,
      lastMonthOrders,
      totalRevenue,
      thisMonthRevenue,
      lastMonthRevenue,
      totalUsers,
      newUsersToday,
      newUsersThisMonth,
      totalMedicines,
      lowStockCount,
    ] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ createdAt: { $gte: today } }),
      Order.countDocuments({ createdAt: { $gte: thisMonth } }),
      Order.countDocuments({ createdAt: { $gte: lastMonth, $lte: lastMonthEnd } }),
      Order.aggregate([{ $match: { paymentStatus: "paid" } }, { $group: { _id: null, total: { $sum: "$total" } } }]),
      Order.aggregate([{ $match: { paymentStatus: "paid", createdAt: { $gte: thisMonth } } }, { $group: { _id: null, total: { $sum: "$total" } } }]),
      Order.aggregate([{ $match: { paymentStatus: "paid", createdAt: { $gte: lastMonth, $lte: lastMonthEnd } } }, { $group: { _id: null, total: { $sum: "$total" } } }]),
      User.countDocuments({ role: "customer" }),
      User.countDocuments({ role: "customer", createdAt: { $gte: today } }),
      User.countDocuments({ role: "customer", createdAt: { $gte: thisMonth } }),
      Medicine.countDocuments({ isActive: true }),
      Medicine.countDocuments({ isActive: true, $expr: { $lte: ["$stock", "$lowStockThreshold"] } }),
    ]);

    const rev = (agg) => agg[0]?.total || 0;
    const thisMonthRev = rev(thisMonthRevenue);
    const lastMonthRev = rev(lastMonthRevenue);
    const revGrowth = lastMonthRev > 0 ? ((thisMonthRev - lastMonthRev) / lastMonthRev) * 100 : 0;

    res.json({
      success: true,
      stats: {
        orders: { total: totalOrders, today: todayOrders, thisMonth: thisMonthOrders, lastMonth: lastMonthOrders },
        revenue: {
          total: rev(totalRevenue),
          thisMonth: thisMonthRev,
          lastMonth: lastMonthRev,
          growth: Math.round(revGrowth * 10) / 10,
        },
        users: { total: totalUsers, newToday: newUsersToday, newThisMonth: newUsersThisMonth },
        medicines: { total: totalMedicines, lowStock: lowStockCount },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Revenue By Period ────────────────────────────────────────────────────────
exports.getRevenueByPeriod = async (req, res, next) => {
  try {
    const months = parseInt(req.query.months) || 12;
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const data = await Order.aggregate([
      { $match: { paymentStatus: "paid", createdAt: { $gte: since } } },
      {
        $group: {
          _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
          revenue: { $sum: "$total" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── Top Products ─────────────────────────────────────────────────────────────
exports.getTopProducts = async (req, res, next) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const data = await Order.aggregate([
      { $match: { createdAt: { $gte: since }, status: { $nin: ["cancelled", "refunded"] } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.medicine",
          name: { $first: "$items.name" },
          totalQuantity: { $sum: "$items.quantity" },
          totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: limit },
    ]);

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── Order Status Distribution ────────────────────────────────────────────────
exports.getOrderStatusBreakdown = async (req, res, next) => {
  try {
    const data = await Order.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 }, revenue: { $sum: "$total" } } },
      { $sort: { count: -1 } },
    ]);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── User Registration Trend ──────────────────────────────────────────────────
exports.getUserTrend = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const data = await User.aggregate([
      { $match: { role: "customer", createdAt: { $gte: since } } },
      {
        $group: {
          _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" }, day: { $dayOfMonth: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── Recent Orders ────────────────────────────────────────────────────────────
exports.getRecentOrders = async (req, res, next) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const orders = await Order.find()
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("orderNumber user status total paymentMethod createdAt");

    res.json({ success: true, orders });
  } catch (err) {
    next(err);
  }
};

// ─── Sales Report ─────────────────────────────────────────────────────────────
exports.getSalesReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const match = { paymentStatus: "paid" };
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    const [summary, byCategory] = await Promise.all([
      Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$total" },
            totalOrders: { $sum: 1 },
            avgOrderValue: { $avg: "$total" },
            totalDiscount: { $sum: "$couponDiscount" },
          },
        },
      ]),
      Order.aggregate([
        { $match: match },
        { $unwind: "$items" },
        {
          $lookup: {
            from: "medicines",
            localField: "items.medicine",
            foreignField: "_id",
            as: "medicineData",
          },
        },
        { $unwind: { path: "$medicineData", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: "$medicineData.category",
            revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
            quantity: { $sum: "$items.quantity" },
          },
        },
        {
          $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "category" },
        },
        { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
        { $project: { category: "$category.name", revenue: 1, quantity: 1 } },
        { $sort: { revenue: -1 } },
      ]),
    ]);

    res.json({ success: true, summary: summary[0] || {}, byCategory });
  } catch (err) {
    next(err);
  }
};
