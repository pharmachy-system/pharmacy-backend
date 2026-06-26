require("./setup");

const request  = require("supertest");
const app      = require("../src/app");
const User     = require("../src/models/User.model");
const Order    = require("../src/models/Order.model");
const Payment  = require("../src/models/Payment.model");
const Wallet   = require("../src/models/Wallet.model");
const Medicine = require("../src/models/Medicine.model");
const Category = require("../src/models/Category.model");
const mongoose = require("mongoose");

const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;
const ADMIN_SECRET = process.env.ADMIN_REGISTRATION_SECRET;

describe("Payment System — full coverage", () => {
  let adminToken, adminId;
  let customerToken, customerId;
  let med, cat;
  let cashOrderId, walletOrderId;

  beforeAll(async () => {
    const s = suf();

    const adminRes = await request(app).post("/api/auth/register").send({
      name: "Pay Admin", email: `pay_admin_${s}@pharmacy-test.com`,
      password: "Password123!", role: "admin", adminSecret: ADMIN_SECRET,
    });
    adminToken = adminRes.body.accessToken;
    adminId    = adminRes.body.user?.id;

    const custRes = await request(app).post("/api/auth/register").send({
      name: "Pay Cust", email: `pay_cust2_${s}@pharmacy-test.com`,
      password: "Password123!",
    });
    customerToken = custRes.body.accessToken;
    customerId    = custRes.body.user?.id;

    cat = await Category.create({ name: `PayCat2_${s}` });
    med = await Medicine.create({
      name: `PayMed2_${s}`, price: 80, stock: 50,
      category: cat._id, requiresPrescription: false,
    });

    // COD order seeded directly
    const cashOrder = await Order.create({
      orderNumber: `ORD-PCASH-${s}`,
      user:        customerId,
      items:       [{ medicine: med._id, name: med.name, quantity: 1, price: 80 }],
      subtotal:    80, total: 80,
      status:      "delivered",
      paymentMethod: "cash",
      paymentStatus: "paid",
      shippingAddress: { fullName: "Test", phone: "0500000010", street: "St", city: "Riyadh", country: "SA" },
    });
    cashOrderId = cashOrder._id.toString();

    // Wallet order seeded directly
    const wOrder = await Order.create({
      orderNumber: `ORD-PWALLET-${s}`,
      user:        customerId,
      items:       [{ medicine: med._id, name: med.name, quantity: 1, price: 80 }],
      subtotal:    80, total: 80,
      status:      "delivered",
      paymentMethod: "wallet",
      paymentStatus: "paid",
      shippingAddress: { fullName: "Test", phone: "0500000010", street: "St", city: "Riyadh", country: "SA" },
    });
    walletOrderId = wOrder._id.toString();

    // Seed completed payments for both orders
    await Payment.create({ order: cashOrderId,   user: customerId, method: "cash",   amount: 80, status: "completed" });
    await Payment.create({ order: walletOrderId, user: customerId, method: "wallet", amount: 80, status: "completed" });

    // Give customer a wallet with enough balance for refund checks
    await Wallet.create({ user: customerId, balance: 200 });
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
    await Order.deleteMany({ "shippingAddress.phone": "0500000010" });
    await Payment.deleteMany({ amount: 80 });
    await Wallet.deleteMany({});
    await Medicine.deleteMany({ name: /^PayMed2_/ });
    await Category.deleteMany({ name: /^PayCat2_/ });
  });

  // ─── Payment History ──────────────────────────────────────────────────────

  describe("GET /api/payments/history", () => {
    it("returns user payment list with pagination", async () => {
      const res = await request(app)
        .get("/api/payments/history")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.payments)).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.payments.length).toBeGreaterThanOrEqual(2);
    });

    it("filters by status", async () => {
      const res = await request(app)
        .get("/api/payments/history?status=completed")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.payments.every((p) => p.status === "completed")).toBe(true);
    });

    it("filters by method", async () => {
      const res = await request(app)
        .get("/api/payments/history?method=cash")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.payments.every((p) => p.method === "cash")).toBe(true);
    });

    it("requires auth", async () => {
      const res = await request(app).get("/api/payments/history");
      expect(res.status).toBe(401);
    });
  });

  // ─── Verify Payment ───────────────────────────────────────────────────────

  describe("GET /api/payments/:orderId/verify", () => {
    it("returns paymentStatus and payment record", async () => {
      const res = await request(app)
        .get(`/api/payments/${cashOrderId}/verify`)
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.paymentStatus).toBeDefined();
      expect(res.body.payment).toBeDefined();
    });

    it("returns 404 for unknown order", async () => {
      const res = await request(app)
        .get(`/api/payments/${new mongoose.Types.ObjectId()}/verify`)
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(404);
    });

    it("requires auth", async () => {
      const res = await request(app).get(`/api/payments/${cashOrderId}/verify`);
      expect(res.status).toBe(401);
    });
  });

  // ─── Refund ───────────────────────────────────────────────────────────────

  describe("POST /api/payments/refund", () => {
    it("issues a wallet refund for wallet-paid order", async () => {
      const res = await request(app)
        .post("/api/payments/refund")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ orderId: walletOrderId, reason: "Not satisfied" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.refundAmount).toBe(80);
    });

    it("returns 400 for already-refunded order", async () => {
      const res = await request(app)
        .post("/api/payments/refund")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ orderId: walletOrderId });
      expect(res.status).toBe(400);
    });

    it("returns 400 when orderId is missing", async () => {
      const res = await request(app)
        .post("/api/payments/refund")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it("returns 404 for order not belonging to user", async () => {
      const res = await request(app)
        .post("/api/payments/refund")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ orderId: new mongoose.Types.ObjectId().toString() });
      expect(res.status).toBe(404);
    });

    it("requires auth", async () => {
      const res = await request(app).post("/api/payments/refund").send({ orderId: cashOrderId });
      expect(res.status).toBe(401);
    });
  });

  // ─── Admin: List All Payments ─────────────────────────────────────────────

  describe("GET /api/payments/admin/all", () => {
    it("admin gets paginated payment list with summary", async () => {
      const res = await request(app)
        .get("/api/payments/admin/all")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.payments)).toBe(true);
      expect(res.body.summary).toBeDefined();
      expect(typeof res.body.summary.totalRevenue).toBe("number");
      expect(res.body.pagination).toBeDefined();
    });

    it("filters by method=cash", async () => {
      const res = await request(app)
        .get("/api/payments/admin/all?method=cash")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.payments.every((p) => p.method === "cash")).toBe(true);
    });

    it("customer gets 403", async () => {
      const res = await request(app)
        .get("/api/payments/admin/all")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
    });
  });

  // ─── Admin: Update Payment Status ─────────────────────────────────────────

  describe("PATCH /api/payments/admin/:id/status", () => {
    let cashPaymentId;

    beforeAll(async () => {
      const p = await Payment.findOne({ order: cashOrderId });
      cashPaymentId = p._id.toString();
    });

    it("admin can update payment status", async () => {
      const res = await request(app)
        .patch(`/api/payments/admin/${cashPaymentId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "completed" });
      expect(res.status).toBe(200);
      expect(res.body.payment.status).toBe("completed");
    });

    it("rejects invalid status", async () => {
      const res = await request(app)
        .patch(`/api/payments/admin/${cashPaymentId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "bogus" });
      expect(res.status).toBe(400);
    });

    it("customer gets 403", async () => {
      const res = await request(app)
        .patch(`/api/payments/admin/${cashPaymentId}/status`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ status: "completed" });
      expect(res.status).toBe(403);
    });
  });

  // ─── COD payment auto-created on order placement ──────────────────────────

  describe("COD payment record created on order placement", () => {
    it("places a cash order and expects a Payment record with method=cash", async () => {
      const orderRes = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          items:           [{ medicine: med._id.toString(), quantity: 1 }],
          shippingAddress: { fullName: "COD Test", phone: "0500000011", street: "St2", city: "Riyadh", country: "SA" },
          paymentMethod:   "cash",
        });

      expect(orderRes.status).toBe(201);
      const newOrderId = orderRes.body.order._id;

      // Give async Payment.create a moment
      await new Promise((r) => setTimeout(r, 200));

      const payment = await Payment.findOne({ order: newOrderId });
      expect(payment).toBeTruthy();
      expect(payment.method).toBe("cash");
      expect(payment.status).toBe("pending");
    });
  });
});
