require("./setup");

const request  = require("supertest");
const app      = require("../src/app");
const User     = require("../src/models/User.model");
const Order    = require("../src/models/Order.model");
const Return   = require("../src/models/Return.model");
const Medicine = require("../src/models/Medicine.model");
const Category = require("../src/models/Category.model");
const Wallet   = require("../src/models/Wallet.model");
const Payment  = require("../src/models/Payment.model");
const mongoose = require("mongoose");

const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;
const ADMIN_SECRET = process.env.ADMIN_REGISTRATION_SECRET;

describe("Returns & Refunds API", () => {
  let adminToken, customerToken, customerId, otherToken;
  let med, cat;
  let deliveredOrderId, medId;
  let partialOrderId;

  beforeAll(async () => {
    const s = suf();

    const adminRes = await request(app).post("/api/auth/register").send({
      name: "Ret Admin", email: `ret_admin_${s}@pharmacy-test.com`,
      password: "Password123!", role: "admin", adminSecret: ADMIN_SECRET,
    });
    adminToken = adminRes.body.accessToken;

    const custRes = await request(app).post("/api/auth/register").send({
      name: "Ret Cust", email: `ret_cust_${s}@pharmacy-test.com`,
      password: "Password123!",
    });
    customerToken = custRes.body.accessToken;
    customerId    = custRes.body.user?.id;

    const otherRes = await request(app).post("/api/auth/register").send({
      name: "Ret Other", email: `ret_other_${s}@pharmacy-test.com`,
      password: "Password123!",
    });
    otherToken = otherRes.body.accessToken;

    cat = await Category.create({ name: `RetCat_${s}` });
    med = await Medicine.create({
      name: `RetMed_${s}`, price: 50, stock: 100,
      category: cat._id, requiresPrescription: false,
    });
    medId = med._id.toString();

    // Primary fully-delivered order
    const deliveredOrder = await Order.create({
      orderNumber:    `ORD-RET-A-${s}`,
      user:           customerId,
      items:          [{ medicine: med._id, name: med.name, quantity: 2, price: 50 }],
      subtotal:       100, total: 100,
      status:         "delivered",
      paymentMethod:  "wallet",
      paymentStatus:  "paid",
      deliveredAt:    new Date(),
      shippingAddress: { fullName: "Ret Test", phone: "0500000030", street: "St", city: "Riyadh", country: "SA" },
    });
    deliveredOrderId = deliveredOrder._id.toString();

    await Payment.create({
      order: deliveredOrder._id, user: customerId,
      method: "wallet", amount: 100, status: "completed",
    });
    await Wallet.create({ user: customerId, balance: 50 });

    // Second order with 2 items for partial return test
    const med2 = await Medicine.create({
      name: `RetMed2_${s}`, price: 30, stock: 100,
      category: cat._id, requiresPrescription: false,
    });
    const partialOrder = await Order.create({
      orderNumber:    `ORD-RET-B-${s}`,
      user:           customerId,
      items: [
        { medicine: med._id,  name: med.name,  quantity: 2, price: 50 },
        { medicine: med2._id, name: med2.name, quantity: 1, price: 30 },
      ],
      subtotal: 130, total: 130,
      status:   "delivered",
      paymentMethod: "wallet",
      paymentStatus: "paid",
      deliveredAt: new Date(),
      shippingAddress: { fullName: "Ret Test", phone: "0500000030", street: "St", city: "Riyadh", country: "SA" },
    });
    partialOrderId = partialOrder._id.toString();

    await Payment.create({
      order: partialOrder._id, user: customerId,
      method: "wallet", amount: 130, status: "completed",
    });
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
    await Order.deleteMany({ "shippingAddress.phone": "0500000030" });
    await Return.deleteMany({ user: customerId });
    await Payment.deleteMany({ amount: { $in: [100, 130] } });
    await Wallet.deleteMany({ user: customerId });
    await Medicine.deleteMany({ name: /^RetMed/ });
    await Category.deleteMany({ name: /^RetCat_/ });
  });

  // ─── Create Return ────────────────────────────────────────────────────────

  describe("POST /api/returns — create return request", () => {
    it("creates a full return for a delivered order", async () => {
      const res = await request(app)
        .post("/api/returns")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          orderId:      deliveredOrderId,
          refundMethod: "wallet",
          items: [{ medicineId: medId, quantity: 2, reason: "damaged" }],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.return.returnType).toBe("full");
      expect(res.body.return.status).toBe("pending");
      expect(res.body.return.totalRefundAmount).toBe(100);
      expect(res.body.return.returnNumber).toMatch(/^RET-/);
    });

    it("returns 400 for duplicate return on same order", async () => {
      const res = await request(app)
        .post("/api/returns")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          orderId:      deliveredOrderId,
          refundMethod: "wallet",
          items: [{ medicineId: medId, quantity: 2, reason: "damaged" }],
        });
      expect(res.status).toBe(400);
    });

    it("creates a partial return (only one item)", async () => {
      const res = await request(app)
        .post("/api/returns")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          orderId:      partialOrderId,
          refundMethod: "wallet",
          items: [{ medicineId: medId, quantity: 1, reason: "changed_mind" }],
        });
      expect(res.status).toBe(201);
      expect(res.body.return.returnType).toBe("partial");
      expect(res.body.return.totalRefundAmount).toBe(50);
    });

    it("returns 400 when quantity exceeds ordered quantity", async () => {
      // partialOrderId already has a pending return, create another delivered order
      const cat2 = await Category.create({ name: `RetCat2_${suf()}` });
      const m3   = await Medicine.create({
        name: `RetMed3_${suf()}`, price: 20, stock: 10,
        category: cat2._id, requiresPrescription: false,
      });
      const o = await Order.create({
        orderNumber: `ORD-RET-C-${suf()}`,
        user: customerId,
        items: [{ medicine: m3._id, name: m3.name, quantity: 1, price: 20 }],
        subtotal: 20, total: 20,
        status: "delivered", paymentMethod: "wallet", paymentStatus: "paid",
        deliveredAt: new Date(),
        shippingAddress: { fullName: "Ret Test", phone: "0500000031", street: "St", city: "Riyadh", country: "SA" },
      });
      const res = await request(app)
        .post("/api/returns")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          orderId: o._id.toString(),
          items: [{ medicineId: m3._id.toString(), quantity: 5, reason: "damaged" }],
        });
      expect(res.status).toBe(400);
    });

    it("returns 400 when order is not delivered", async () => {
      const pendingOrder = await Order.create({
        orderNumber: `ORD-RET-P-${suf()}`,
        user: customerId,
        items: [{ medicine: med._id, name: med.name, quantity: 1, price: 50 }],
        subtotal: 50, total: 50,
        status: "confirmed", paymentMethod: "cash", paymentStatus: "pending",
        shippingAddress: { fullName: "Ret Test", phone: "0500000030", street: "St", city: "Riyadh", country: "SA" },
      });
      const res = await request(app)
        .post("/api/returns")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          orderId: pendingOrder._id.toString(),
          items: [{ medicineId: medId, quantity: 1, reason: "damaged" }],
        });
      expect(res.status).toBe(400);
    });

    it("returns 400 when items array is empty", async () => {
      const res = await request(app)
        .post("/api/returns")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ orderId: deliveredOrderId, items: [] });
      // Joi validates array.min(1) → 422; controller also returns 400
      expect([400, 422]).toContain(res.status);
    });

    it("requires auth", async () => {
      const res = await request(app).post("/api/returns").send({ orderId: deliveredOrderId, items: [] });
      expect(res.status).toBe(401);
    });
  });

  // ─── Get My Returns ───────────────────────────────────────────────────────

  describe("GET /api/returns/my", () => {
    it("returns list of user's own returns", async () => {
      const res = await request(app)
        .get("/api/returns/my")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.returns.length).toBeGreaterThanOrEqual(1);
      expect(res.body.pagination).toBeDefined();
    });

    it("filters by status", async () => {
      const res = await request(app)
        .get("/api/returns/my?status=pending")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.returns.every((r) => r.status === "pending")).toBe(true);
    });

    it("other user sees empty list", async () => {
      const res = await request(app)
        .get("/api/returns/my")
        .set("Authorization", `Bearer ${otherToken}`);
      expect(res.status).toBe(200);
      expect(res.body.returns).toHaveLength(0);
    });

    it("requires auth", async () => {
      const res = await request(app).get("/api/returns/my");
      expect(res.status).toBe(401);
    });
  });

  // ─── Get Return by ID ─────────────────────────────────────────────────────

  describe("GET /api/returns/:id", () => {
    let returnId;

    beforeAll(async () => {
      const ret = await Return.findOne({ user: customerId });
      returnId = ret._id.toString();
    });

    it("owner can fetch their return", async () => {
      const res = await request(app)
        .get(`/api/returns/${returnId}`)
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.return._id).toBe(returnId);
    });

    it("other user gets 403", async () => {
      const res = await request(app)
        .get(`/api/returns/${returnId}`)
        .set("Authorization", `Bearer ${otherToken}`);
      expect(res.status).toBe(403);
    });

    it("admin can fetch any return", async () => {
      const res = await request(app)
        .get(`/api/returns/${returnId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });

    it("returns 404 for unknown id", async () => {
      const res = await request(app)
        .get(`/api/returns/${new mongoose.Types.ObjectId()}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  // ─── Admin: List All Returns ──────────────────────────────────────────────

  describe("GET /api/returns — admin", () => {
    it("admin gets full list with pagination", async () => {
      const res = await request(app)
        .get("/api/returns")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.returns.length).toBeGreaterThan(0);
    });

    it("filters by returnType=partial", async () => {
      const res = await request(app)
        .get("/api/returns?returnType=partial")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.returns.every((r) => r.returnType === "partial")).toBe(true);
    });

    it("customer gets 403", async () => {
      const res = await request(app)
        .get("/api/returns")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
    });
  });

  // ─── Admin: Approve → Complete flow ──────────────────────────────────────

  describe("Full return approval flow", () => {
    let fullReturnId;
    const stockBeforeReturn = {};

    beforeAll(async () => {
      // Find the full return on deliveredOrderId
      const ret = await Return.findOne({ order: deliveredOrderId, returnType: "full" });
      fullReturnId = ret._id.toString();

      const m = await Medicine.findById(medId);
      stockBeforeReturn[medId] = m.stock;
    });

    it("admin rejects a return with a reason", async () => {
      // Find the partial return to reject
      const partial = await Return.findOne({ order: partialOrderId, returnType: "partial" });

      const res = await request(app)
        .patch(`/api/returns/${partial._id}/reject`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ rejectionReason: "Items appear to have been used", adminNote: "Rejected per policy" });

      expect(res.status).toBe(200);
      expect(res.body.return.status).toBe("rejected");
      expect(res.body.return.rejectionReason).toBeTruthy();
    });

    it("returns 400 when rejecting without a reason", async () => {
      const ret = await Return.findOne({ order: deliveredOrderId, status: "pending" });
      const res = await request(app)
        .patch(`/api/returns/${ret._id}/reject`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});
      // Joi validates rejectionReason as required → 422; controller also returns 400
      expect([400, 422]).toContain(res.status);
    });

    it("admin approves full return — wallet credited", async () => {
      const walletBefore = await Wallet.findOne({ user: customerId });
      const balanceBefore = walletBefore.balance;

      const res = await request(app)
        .patch(`/api/returns/${fullReturnId}/approve`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ adminNote: "Approved after inspection" });

      expect(res.status).toBe(200);
      expect(res.body.return.status).toBe("processing");

      const walletAfter = await Wallet.findOne({ user: customerId });
      expect(walletAfter.balance).toBeCloseTo(balanceBefore + 100, 0);
    });

    it("returns 400 when approving an already-processed return", async () => {
      const res = await request(app)
        .patch(`/api/returns/${fullReturnId}/approve`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it("admin completes return — inventory restocked", async () => {
      const res = await request(app)
        .patch(`/api/returns/${fullReturnId}/complete`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.return.status).toBe("completed");
      expect(res.body.return.stockRestored).toBe(true);

      const medAfter = await Medicine.findById(medId);
      expect(medAfter.stock).toBe(stockBeforeReturn[medId] + 2);
    });

    it("returns 400 when completing a non-processing return", async () => {
      const res = await request(app)
        .patch(`/api/returns/${fullReturnId}/complete`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it("customer gets 403 on approve/reject/complete", async () => {
      const [a, b, c] = await Promise.all([
        request(app).patch(`/api/returns/${fullReturnId}/approve`).set("Authorization", `Bearer ${customerToken}`).send({}),
        request(app).patch(`/api/returns/${fullReturnId}/reject`).set("Authorization", `Bearer ${customerToken}`).send({ rejectionReason: "x" }),
        request(app).patch(`/api/returns/${fullReturnId}/complete`).set("Authorization", `Bearer ${customerToken}`).send({}),
      ]);
      expect(a.status).toBe(403);
      expect(b.status).toBe(403);
      expect(c.status).toBe(403);
    });
  });
});
