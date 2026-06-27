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

  // ── Admin ────────────────────────────────────────────────────────────────────
  router.use("/admin/dashboard",  require("./admin/dashboard.routes"));
  router.use("/admin/inventory",  require("./admin/inventory.routes"));
  router.use("/admin/audit",      require("./admin/audit.routes"));

  // ── Mount at both /api (legacy) and /api/v1 (versioned) ──────────────────────
  app.use("/api",    router);
  app.use("/api/v1", router);

  // ── System — stays at /health (not versioned) ─────────────────────────────────
  app.get("/health", (req, res) =>
    res.json({
      success:     true,
      status:      "ok",
      version:     "v1",
      environment: process.env.NODE_ENV,
      timestamp:   new Date().toISOString(),
    })
  );
};
