const express = require("express");
const router = express.Router();
const { protect } = require("../../middlewares/auth.middleware");
const authorize = require("../../middlewares/role.middleware");
const { cacheGet } = require("../../middlewares/cache.middleware");

router.use(protect, authorize("admin"));

/**
 * GET /api/admin/system
 * Returns process and dependency health info for ops/dashboards.
 */
router.get("/", async (req, res, next) => {
  try {
    const mongoose = require("mongoose");
    const mem = process.memoryUsage();

    const readyState = mongoose.connection.readyState;
    const dbStates = ["disconnected", "connected", "connecting", "disconnecting"];

    let dbPingMs = null;
    if (readyState === 1) {
      try {
        const t0 = Date.now();
        await mongoose.connection.db.admin().ping();
        dbPingMs = Date.now() - t0;
      } catch (_) {}
    }

    const optionalVars = [
      "SENTRY_DSN", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY",
      "CLOUDINARY_API_SECRET", "SMTP_HOST", "TWILIO_SID",
      "FIREBASE_PROJECT_ID", "ZATCA_VAT_NUMBER", "STRIPE_SECRET_KEY",
    ];
    const envStatus = Object.fromEntries(
      optionalVars.map((k) => [k, !!process.env[k]])
    );

    res.json({
      success: true,
      system: {
        nodeVersion: process.version,
        platform:    process.platform,
        uptimeSeconds: Math.floor(process.uptime()),
        pid: process.pid,
        memory: {
          heapUsedMB:  parseFloat((mem.heapUsed  / 1048576).toFixed(1)),
          heapTotalMB: parseFloat((mem.heapTotal / 1048576).toFixed(1)),
          externalMB:  parseFloat((mem.external  / 1048576).toFixed(1)),
          rssMB:       parseFloat((mem.rss       / 1048576).toFixed(1)),
        },
        database: {
          status: dbStates[readyState] || "unknown",
          pingMs: dbPingMs,
          host:   mongoose.connection.host,
          name:   mongoose.connection.name,
        },
        environment: process.env.NODE_ENV || "development",
        integrations: envStatus,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
