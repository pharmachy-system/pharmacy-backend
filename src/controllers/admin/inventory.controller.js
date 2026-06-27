const Medicine = require("../../models/Medicine.model");
const Order = require("../../models/Order.model");

// ─── Inventory Summary ────────────────────────────────────────────────────────
exports.getInventorySummary = async (req, res, next) => {
  try {
    const [summary, byCategory, lowStock, outOfStock, expired] = await Promise.all([
      Medicine.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: null,
            totalItems: { $sum: 1 },
            totalStock: { $sum: "$stock" },
            totalValue: { $sum: { $multiply: ["$price", "$stock"] } },
            avgPrice: { $avg: "$price" },
          },
        },
      ]),
      Medicine.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: "$category", count: { $sum: 1 }, totalStock: { $sum: "$stock" } } },
        { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "category" } },
        { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
        { $project: { name: "$category.name", count: 1, totalStock: 1 } },
        { $sort: { count: -1 } },
      ]),
      Medicine.countDocuments({ isActive: true, $expr: { $lte: ["$stock", "$lowStockThreshold"] }, stock: { $gt: 0 } }),
      Medicine.countDocuments({ isActive: true, stock: 0 }),
      Medicine.countDocuments({ isActive: true, expiryDate: { $lt: new Date() } }),
    ]);

    res.json({
      success: true,
      summary: { ...(summary[0] || {}), lowStock, outOfStock, expired },
      byCategory,
    });
  } catch (err) {
    next(err);
  }
};

// ─── Low Stock Report ─────────────────────────────────────────────────────────
exports.getLowStockReport = async (req, res, next) => {
  try {
    const medicines = await Medicine.find({
      isActive: true,
      $expr: { $lte: ["$stock", "$lowStockThreshold"] },
    })
      .populate("category", "name")
      .sort({ stock: 1 });

    res.json({ success: true, count: medicines.length, medicines });
  } catch (err) {
    next(err);
  }
};

// ─── Expiry Report ────────────────────────────────────────────────────────────
exports.getExpiryReport = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const [expiring, expired] = await Promise.all([
      Medicine.find({ isActive: true, expiryDate: { $lte: cutoff, $gt: new Date() } })
        .populate("category", "name")
        .sort({ expiryDate: 1 }),
      Medicine.find({ isActive: true, expiryDate: { $lt: new Date() } })
        .populate("category", "name")
        .sort({ expiryDate: 1 }),
    ]);

    res.json({ success: true, expiring, expired });
  } catch (err) {
    next(err);
  }
};

// ─── Stock Movement (sold in period) ─────────────────────────────────────────
exports.getStockMovement = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const data = await Order.aggregate([
      { $match: { createdAt: { $gte: since }, status: { $nin: ["cancelled", "refunded"] } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.medicine",
          name: { $first: "$items.name" },
          totalSold: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        },
      },
      { $sort: { totalSold: -1 } },
      { $limit: 50 },
    ]);

    res.json({ success: true, period: `${days} days`, data });
  } catch (err) {
    next(err);
  }
};

// ─── Bulk Activate / Deactivate ───────────────────────────────────────────────
exports.bulkUpdateStatus = async (req, res, next) => {
  try {
    const { medicineIds, isActive } = req.body;
    if (!Array.isArray(medicineIds) || medicineIds.length === 0) {
      return res.status(400).json({ success: false, message: "Provide at least one medicine ID | يجب تحديد دواء واحد على الأقل" });
    }
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ success: false, message: "isActive must be a boolean | يجب أن يكون isActive قيمة منطقية" });
    }

    const result = await Medicine.updateMany(
      { _id: { $in: medicineIds } },
      { $set: { isActive } }
    );

    res.json({
      success: true,
      matched: result.matchedCount,
      updated: result.modifiedCount,
      action:  isActive ? "activated" : "deactivated",
    });
  } catch (err) {
    next(err);
  }
};

// ─── Bulk Update Stock ────────────────────────────────────────────────────────
exports.bulkUpdateStock = async (req, res, next) => {
  try {
    const { updates } = req.body; // [{ medicineId, quantity, operation }]
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ success: false, message: "No updates provided" });
    }

    const results = [];
    for (const { medicineId, quantity, operation = "set" } of updates) {
      const medicine = await Medicine.findById(medicineId);
      if (!medicine) { results.push({ medicineId, error: "Not found" }); continue; }

      if (operation === "add") medicine.stock += Number(quantity);
      else if (operation === "subtract") medicine.stock = Math.max(0, medicine.stock - Number(quantity));
      else medicine.stock = Number(quantity);

      await medicine.save();
      results.push({ medicineId, name: medicine.name, newStock: medicine.stock });
    }

    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
};
