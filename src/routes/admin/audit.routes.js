const express = require("express");
const router = express.Router();
const { protect } = require("../../middlewares/auth.middleware");
const authorize = require("../../middlewares/role.middleware");
const AuditLog = require("../../models/AuditLog.model");

router.use(protect, authorize("admin"));

// GET /api/admin/audit — paginated audit trail
router.get("/", async (req, res, next) => {
  try {
    const page  = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.actor)    filter.actor    = req.query.actor;
    if (req.query.action)   filter.action   = req.query.action;
    if (req.query.resource) filter.resource = req.query.resource;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to)   filter.createdAt.$lte = new Date(req.query.to);
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate("actor", "name email role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      logs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/audit/:id — single log entry
router.get("/:id", async (req, res, next) => {
  try {
    const log = await AuditLog.findById(req.params.id).populate("actor", "name email role");
    if (!log) return res.status(404).json({ success: false, message: "Audit log not found" });
    res.json({ success: true, log });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
