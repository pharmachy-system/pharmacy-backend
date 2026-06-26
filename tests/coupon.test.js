require("./setup");

const request  = require("supertest");
const app      = require("../src/app");
const User     = require("../src/models/User.model");
const Coupon   = require("../src/models/Coupon.model");
const mongoose = require("mongoose");

const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;
const ADMIN_SECRET = process.env.ADMIN_REGISTRATION_SECRET;

const future = (days = 30) => new Date(Date.now() + days * 86400000);
const past   = (days = 1)  => new Date(Date.now() - days * 86400000);

describe("Coupons API", () => {
  let adminToken, customerToken;
  let couponId, couponCode;

  beforeAll(async () => {
    const s = suf();
    const adminRes = await request(app).post("/api/auth/register").send({
      name: "Coup Admin", email: `coup_admin_${s}@pharmacy-test.com`,
      password: "Password123!", role: "admin", adminSecret: ADMIN_SECRET,
    });
    adminToken = adminRes.body.accessToken;

    const custRes = await request(app).post("/api/auth/register").send({
      name: "Coup Customer", email: `coup_cust_${s}@pharmacy-test.com`,
      password: "Password123!",
    });
    customerToken = custRes.body.accessToken;
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
    await Coupon.deleteMany({ code: /^TEST/ });
  });

  // ─── Admin CRUD ────────────────────────────────────────────────────────────

  describe("POST /api/coupons — admin create", () => {
    it("admin creates a percentage coupon", async () => {
      couponCode = `TEST${suf().slice(-6).toUpperCase()}`;
      const res = await request(app)
        .post("/api/coupons")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code: couponCode,
          type: "percentage",
          value: 15,
          validFrom: past(),
          validUntil: future(),
          minOrderAmount: 50,
          description: "15% off orders over 50 SAR",
        });

      expect(res.status).toBe(201);
      expect(res.body.coupon.code).toBe(couponCode);
      couponId = res.body.coupon._id;
    });

    it("admin creates a fixed-amount coupon", async () => {
      const code = `TEST${suf().slice(-6).toUpperCase()}`;
      const res = await request(app)
        .post("/api/coupons")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code,
          type: "fixed",
          value: 20,
          validFrom: past(),
          validUntil: future(),
        });
      expect(res.status).toBe(201);
      expect(res.body.coupon.type).toBe("fixed");
    });

    it("customer cannot create coupon (403)", async () => {
      const res = await request(app)
        .post("/api/coupons")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          code: `TEST${suf().slice(-6)}`, type: "percentage", value: 10,
          validFrom: past(), validUntil: future(),
        });
      expect(res.status).toBe(403);
    });

    it("duplicate coupon code returns error", async () => {
      const res = await request(app)
        .post("/api/coupons")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code: couponCode, type: "fixed", value: 5,
          validFrom: past(), validUntil: future(),
        });
      expect([400, 409]).toContain(res.status);
    });
  });

  describe("GET /api/coupons — admin list", () => {
    it("admin gets paginated coupon list", async () => {
      const res = await request(app)
        .get("/api/coupons")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.coupons)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it("customer cannot list coupons (403)", async () => {
      const res = await request(app)
        .get("/api/coupons")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
    });

    it("GET /api/coupons/:id returns coupon detail", async () => {
      const res = await request(app)
        .get(`/api/coupons/${couponId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.coupon._id).toBe(couponId);
    });

    it("returns 404 for unknown id", async () => {
      const res = await request(app)
        .get(`/api/coupons/${new mongoose.Types.ObjectId()}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/coupons/validate — authenticated user", () => {
    it("validates a valid coupon and returns discount amount", async () => {
      const res = await request(app)
        .post("/api/coupons/validate")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ code: couponCode, orderAmount: 100 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.coupon.code).toBe(couponCode);
      expect(typeof res.body.coupon.discount).toBe("number");
      expect(res.body.coupon.discount).toBe(15); // 15% of 100
    });

    it("respects minOrderAmount — returns 400 if order too small", async () => {
      const res = await request(app)
        .post("/api/coupons/validate")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ code: couponCode, orderAmount: 30 }); // below 50 SAR min
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid coupon code", async () => {
      const res = await request(app)
        .post("/api/coupons/validate")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ code: "NO-SUCH-CODE-XYZ", orderAmount: 100 });
      expect(res.status).toBe(400);
    });

    it("returns 400 for expired coupon", async () => {
      const expiredCode = `TEST${suf().slice(-5)}EXP`;
      await Coupon.create({
        code: expiredCode, type: "fixed", value: 10,
        validFrom: past(10), validUntil: past(1),
      });
      const res = await request(app)
        .post("/api/coupons/validate")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ code: expiredCode, orderAmount: 100 });
      expect(res.status).toBe(400);
    });
  });

  describe("PUT/DELETE /api/coupons/:id", () => {
    it("admin can update coupon value", async () => {
      const res = await request(app)
        .put(`/api/coupons/${couponId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ value: 20 });
      expect(res.status).toBe(200);
      expect(res.body.coupon.value).toBe(20);
    });

    it("admin soft-deactivates coupon on delete", async () => {
      const res = await request(app)
        .delete(`/api/coupons/${couponId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const c = await Coupon.findById(couponId);
      expect(c.isActive).toBe(false);
    });
  });
});
