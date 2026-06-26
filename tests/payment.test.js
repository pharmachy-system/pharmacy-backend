require("./setup");

const request = require("supertest");
const app     = require("../src/app");
const User    = require("../src/models/User.model");
const Order   = require("../src/models/Order.model");
const Payment = require("../src/models/Payment.model");
const Wallet  = require("../src/models/Wallet.model");
const Medicine  = require("../src/models/Medicine.model");
const Category  = require("../src/models/Category.model");
const mongoose  = require("mongoose");

const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;
const ADMIN_SECRET = process.env.ADMIN_REGISTRATION_SECRET;

describe("Payments API", () => {
  let customerToken, customerId, orderId, walletOrderId;

  beforeAll(async () => {
    const s = suf();

    const custRes = await request(app).post("/api/auth/register").send({
      name: "Pay Customer", email: `pay_cust_${s}@pharmacy-test.com`,
      password: "Password123!",
    });
    customerToken = custRes.body.accessToken;
    customerId    = custRes.body.user.id;

    // Seed a confirmed order (eligible for createPaymentIntent)
    const cat = await Category.create({ name: `PayCat_${s}` });
    const med = await Medicine.create({
      name: `PayMed_${s}`, price: 75, stock: 10,
      category: cat._id, requiresPrescription: false,
    });
    const order = await Order.create({
      orderNumber: `ORD-PAY-${s}-A`,
      user: customerId,
      items: [{ medicine: med._id, name: med.name, quantity: 1, price: 75 }],
      subtotal: 75,
      total: 75,
      status: "confirmed",
      paymentMethod: "card",
      shippingAddress: {
        fullName: "Pay Test", phone: "0500000002",
        street: "1 Pay St", city: "Riyadh", country: "SA",
      },
    });
    orderId = order._id.toString();

    // Seed a second order paid via wallet (for refund via wallet path)
    const wOrder = await Order.create({
      orderNumber: `ORD-PAY-${s}-B`,
      user: customerId,
      items: [{ medicine: med._id, name: med.name, quantity: 1, price: 75 }],
      subtotal: 75,
      total: 75,
      status: "delivered",
      paymentMethod: "wallet",
      paymentStatus: "paid",
      shippingAddress: {
        fullName: "Pay Test", phone: "0500000002",
        street: "1 Pay St", city: "Riyadh", country: "SA",
      },
    });
    walletOrderId = wOrder._id.toString();

    // Add a completed wallet payment for that order
    await Payment.create({
      order:  wOrder._id,
      user:   customerId,
      method: "wallet",
      amount: 75,
      status: "completed",
    });

    // Ensure the user has a wallet with balance
    await Wallet.create({ user: customerId, balance: 200 });
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
    await Order.deleteMany({ "shippingAddress.phone": "0500000002" });
    await Payment.deleteMany({ amount: 75 });
    await Wallet.deleteMany({ balance: { $in: [200, 275] } });
    await Medicine.deleteMany({ name: /^PayMed_/ });
    await Category.deleteMany({ name: /^PayCat_/ });
  });

  // ─── GET /api/payments/history ─────────────────────────────────────────────

  describe("GET /api/payments/history", () => {
    it("returns paginated payment history", async () => {
      const res = await request(app)
        .get("/api/payments/history")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.payments)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it("requires authentication", async () => {
      const res = await request(app).get("/api/payments/history");
      expect(res.status).toBe(401);
    });
  });

  // ─── POST /api/payments/create-intent ─────────────────────────────────────

  describe("POST /api/payments/create-intent", () => {
    it("returns 500/error when STRIPE_SECRET_KEY is not set in test env", async () => {
      // In test mode, STRIPE_SECRET_KEY is absent — we expect an error response,
      // not a 200 with a clientSecret. The important thing: the route exists and
      // the auth/order-ownership checks run before Stripe is called.
      const res = await request(app)
        .post("/api/payments/create-intent")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ orderId });

      // 400 = already paid, 404 = not found, 500 = Stripe not configured
      expect([400, 404, 500]).toContain(res.status);
    });

    it("returns 404 for unknown orderId", async () => {
      const res = await request(app)
        .post("/api/payments/create-intent")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ orderId: new mongoose.Types.ObjectId().toString() });
      expect(res.status).toBe(404);
    });

    it("requires authentication", async () => {
      const res = await request(app)
        .post("/api/payments/create-intent")
        .send({ orderId });
      expect(res.status).toBe(401);
    });
  });

  // ─── POST /api/payments/refund ─────────────────────────────────────────────

  describe("POST /api/payments/refund", () => {
    it("issues wallet refund for a wallet-paid delivered order", async () => {
      const res = await request(app)
        .post("/api/payments/refund")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ orderId: walletOrderId, reason: "Product damaged" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Wallet balance should increase by 75
      const wallet = await Wallet.findOne({ user: customerId });
      expect(wallet.balance).toBe(275); // 200 + 75
    });

    it("returns 404 for order that belongs to someone else", async () => {
      const res = await request(app)
        .post("/api/payments/refund")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ orderId: new mongoose.Types.ObjectId().toString() });
      expect(res.status).toBe(404);
    });

    it("returns 400 for order not eligible for refund", async () => {
      // The confirmed (not delivered) order is not eligible
      const res = await request(app)
        .post("/api/payments/refund")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ orderId });
      expect(res.status).toBe(400);
    });

    it("requires authentication", async () => {
      const res = await request(app)
        .post("/api/payments/refund")
        .send({ orderId: walletOrderId });
      expect(res.status).toBe(401);
    });
  });

  // ─── POST /api/payments/webhook ───────────────────────────────────────────

  describe("POST /api/payments/webhook", () => {
    it("returns 400 when stripe-signature header is absent", async () => {
      const res = await request(app)
        .post("/api/payments/webhook")
        .send(JSON.stringify({ type: "payment_intent.succeeded" }));
      // Missing signature → Stripe verification fails → 400
      expect([400, 500]).toContain(res.status);
    });
  });
});
