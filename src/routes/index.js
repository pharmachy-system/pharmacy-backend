/**
 * Central route registry.
 *
 * Mounts all route modules onto the Express app.
 * Keeps app.js clean — one call wires everything:
 *
 *   require("./routes")(app);
 *
 * URL structure:
 *   /api/auth/**               Authentication (email, phone OTP, Nafath, biometric, PIN, guest)
 *   /api/users/**              User profiles, addresses, loyalty, avatar
 *   /api/medicines/**          Medicine catalogue
 *   /api/categories/**         Product categories
 *   /api/brands/**             Medicine brands
 *   /api/prescriptions/**      Prescription upload and verification
 *   /api/cart/**               Shopping cart
 *   /api/wishlist/**           Saved items
 *   /api/orders/**             Order lifecycle
 *   /api/payments/**           Stripe & wallet payments
 *   /api/coupons/**            Discount codes
 *   /api/medicines/:id/reviews Reviews
 *   /api/reviews/**            Reviews (direct access)
 *   /api/delivery/**           Delivery zones & driver flow
 *   /api/notifications/**      In-app notifications
 *   /api/wallet/**             Wallet balance & transactions
 *   /api/articles/**           Health articles
 *   /api/flash-sales/**        Time-limited sales
 *   /api/referrals/**          Referral codes & rewards
 *   /api/user/devices/**       Multi-device session management
 *   /api/admin/dashboard/**    Admin KPI dashboard
 *   /api/admin/inventory/**    Admin inventory management
 *   /health                    Health check
 */

module.exports = (app) => {
  // ── Auth & identity ─────────────────────────────────────────────────────────
  app.use("/api/auth",        require("./auth.routes"));
  app.use("/api/user/devices",require("./device.routes"));

  // ── User & profile ───────────────────────────────────────────────────────────
  app.use("/api/users",       require("./user.routes"));

  // ── Catalogue ────────────────────────────────────────────────────────────────
  app.use("/api/medicines",   require("./medicine.routes"));
  app.use("/api/categories",  require("./category.routes"));
  app.use("/api/brands",      require("./brand.routes"));

  // ── Shopping ─────────────────────────────────────────────────────────────────
  app.use("/api/cart",        require("./cart.routes"));
  app.use("/api/wishlist",    require("./wishlist.routes"));
  app.use("/api/coupons",     require("./coupon.routes"));

  // ── Orders & payments ────────────────────────────────────────────────────────
  app.use("/api/orders",      require("./order.routes"));
  app.use("/api/payments",    require("./payment.routes"));
  app.use("/api/returns",     require("./return.routes"));
  app.use("/api/wallet",      require("./wallet.routes"));

  // ── Medical ──────────────────────────────────────────────────────────────────
  app.use("/api/prescriptions", require("./prescription.routes"));

  // ── Reviews (nested + direct) ────────────────────────────────────────────────
  app.use("/api/medicines/:medicineId/reviews", require("./review.routes"));
  app.use("/api/reviews",     require("./review.routes"));

  // ── Delivery ─────────────────────────────────────────────────────────────────
  app.use("/api/delivery",    require("./delivery.routes"));

  // ── Engagement ───────────────────────────────────────────────────────────────
  app.use("/api/notifications", require("./notification.routes"));
  app.use("/api/articles",    require("./article.routes"));
  app.use("/api/flash-sales", require("./flashsale.routes"));
  app.use("/api/referrals",   require("./referral.routes"));

  // ── Reports ───────────────────────────────────────────────────────────────────
  app.use("/api/reports",          require("./report.routes"));

  // ── Admin ─────────────────────────────────────────────────────────────────────
  app.use("/api/admin/dashboard",  require("./admin/dashboard.routes"));
  app.use("/api/admin/inventory",  require("./admin/inventory.routes"));

  // ── System ────────────────────────────────────────────────────────────────────
  app.get("/health", (req, res) =>
    res.json({
      success:     true,
      status:      "ok",
      environment: process.env.NODE_ENV,
      timestamp:   new Date().toISOString(),
    })
  );
};
