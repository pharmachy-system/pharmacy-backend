/**
 * Central route registry.
 *
 * Mounts all route modules onto the Express app via a shared v1 router.
 * Both /api/* and /api/v1/* are supported for backward compatibility.
 *
 *   require("./routes")(app);
 */

const express = require("express");

module.exports = (app) => {
  const router = express.Router();

  // ── App bootstrap (home screen, config) — no auth ───────────────────────────
  router.use("/app",          require("./app.routes"));

  // ── Auth & identity ─────────────────────────────────────────────────────────
  router.use("/auth",         require("./auth.routes"));
  router.use("/user/devices", require("./device.routes"));

  // ── User & profile ───────────────────────────────────────────────────────────
  router.use("/users",        require("./user.routes"));

  // ── Catalogue ────────────────────────────────────────────────────────────────
  router.use("/medicines",    require("./medicine.routes"));
  router.use("/categories",   require("./category.routes"));
  router.use("/brands",       require("./brand.routes"));

  // ── Shopping ─────────────────────────────────────────────────────────────────
  router.use("/cart",         require("./cart.routes"));
  router.use("/wishlist",     require("./wishlist.routes"));
  router.use("/coupons",      require("./coupon.routes"));

  // ── Orders & payments ────────────────────────────────────────────────────────
  router.use("/orders",       require("./order.routes"));
  router.use("/orders/:id/invoice", require("./invoice.routes"));
  router.use("/payments",     require("./payment.routes"));
  router.use("/returns",      require("./return.routes"));
  router.use("/wallet",       require("./wallet.routes"));

  // ── Medical ──────────────────────────────────────────────────────────────────
  router.use("/prescriptions", require("./prescription.routes"));

  // ── Reviews (nested + direct) ────────────────────────────────────────────────
  router.use("/medicines/:medicineId/reviews", require("./review.routes"));
  router.use("/reviews",      require("./review.routes"));

  // ── Delivery ─────────────────────────────────────────────────────────────────
  router.use("/delivery",     require("./delivery.routes"));

  // ── Engagement ───────────────────────────────────────────────────────────────
  router.use("/notifications", require("./notification.routes"));
  router.use("/articles",     require("./article.routes"));
  router.use("/flash-sales",  require("./flashsale.routes"));
  router.use("/referrals",    require("./referral.routes"));

  // ── Reports ──────────────────────────────────────────────────────────────────
  router.use("/reports",      require("./report.routes"));

  // ── AI features ──────────────────────────────────────────────────────────────
  router.use("/ai",           require("./ai.routes"));

  // ── Admin ────────────────────────────────────────────────────────────────────
  router.use("/admin/dashboard",  require("./admin/dashboard.routes"));
  router.use("/admin/inventory",  require("./admin/inventory.routes"));
  router.use("/admin/audit",      require("./admin/audit.routes"));
  router.use("/admin/system",     require("./admin/system.routes"));

  // ── Mount at both /api (legacy) and /api/v1 (versioned) ──────────────────────
  app.use("/api",    router);
  app.use("/api/v1", router);

  // ── System — stays at /health (not versioned) ─────────────────────────────────
  app.get("/health", async (req, res) => {
    const mongoose = require("mongoose");
    const { version } = require("../../package.json");
    const mem = process.memoryUsage();

    // ── MongoDB ────────────────────────────────────────────────────────────────
    const readyState = mongoose.connection.readyState;
    const dbStates = ["disconnected", "connected", "connecting", "disconnecting"];
    const dbStatus = dbStates[readyState] || "unknown";

    let dbPingMs = null;
    if (readyState === 1) {
      try {
        const t0 = Date.now();
        await mongoose.connection.db.admin().ping();
        dbPingMs = Date.now() - t0;
      } catch (_) {
        // ping failed — dbPingMs stays null
      }
    }

    // ── Redis (optional) ──────────────────────────────────────────────────────
    let redisStatus = "not_configured";
    let redisPingMs = null;
    if (process.env.REDIS_URL) {
      try {
        const { createClient } = require("redis");
        const client = createClient({ url: process.env.REDIS_URL });
        await client.connect();
        const t0 = Date.now();
        await client.ping();
        redisPingMs = Date.now() - t0;
        await client.disconnect();
        redisStatus = "connected";
      } catch (_) {
        redisStatus = "error";
      }
    }

    const overallOk = readyState === 1 &&
      (process.env.REDIS_URL ? redisStatus === "connected" : true);

    res.json({
      success:      true,
      status:       overallOk ? "ok" : "degraded",
      version,
      environment:  process.env.NODE_ENV || "development",
      timestamp:    new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        heapUsedMB:  parseFloat((mem.heapUsed  / 1048576).toFixed(1)),
        heapTotalMB: parseFloat((mem.heapTotal / 1048576).toFixed(1)),
        rssMB:       parseFloat((mem.rss       / 1048576).toFixed(1)),
      },
      database: { status: dbStatus, pingMs: dbPingMs },
      redis:    { status: redisStatus, pingMs: redisPingMs },
    });
  });
};
