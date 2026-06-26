require("./setup");

const request   = require("supertest");
const app       = require("../src/app");
const User      = require("../src/models/User.model");
const Medicine  = require("../src/models/Medicine.model");
const FlashSale = require("../src/models/FlashSale.model");
const Category  = require("../src/models/Category.model");
const mongoose  = require("mongoose");

const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;
const ADMIN_SECRET = process.env.ADMIN_REGISTRATION_SECRET;

const future = (h = 1) => new Date(Date.now() + h * 3600000);
const past   = (h = 1) => new Date(Date.now() - h * 3600000);

describe("Flash Sales API", () => {
  let adminToken, customerToken;
  let saleId, medicineId;

  beforeAll(async () => {
    const s = suf();

    const adminRes = await request(app).post("/api/auth/register").send({
      name: "FS Admin", email: `fs_admin_${s}@pharmacy-test.com`,
      password: "Password123!", role: "admin", adminSecret: ADMIN_SECRET,
    });
    adminToken = adminRes.body.accessToken;

    const custRes = await request(app).post("/api/auth/register").send({
      name: "FS Customer", email: `fs_cust_${s}@pharmacy-test.com`,
      password: "Password123!",
    });
    customerToken = custRes.body.accessToken;

    // Seed a medicine for adding to flash sales
    const cat = await Category.create({ name: `FsCat_${s}` });
    const med = await Medicine.create({
      name: `FsMed_${s}`, price: 50, stock: 100,
      category: cat._id, requiresPrescription: false,
    });
    medicineId = med._id.toString();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
    await FlashSale.deleteMany({ name: /^TestSale_/ });
    await Medicine.deleteMany({ name: /^FsMed_/ });
    await Category.deleteMany({ name: /^FsCat_/ });
  });

  // ─── Public: active flash sale ─────────────────────────────────────────────

  describe("GET /api/flash-sales/active", () => {
    it("returns null when no active sale", async () => {
      const res = await request(app)
        .get("/api/flash-sales/active")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // May be null if no live sale exists
    });
  });

  // ─── Admin CRUD ────────────────────────────────────────────────────────────

  describe("POST /api/flash-sales — admin create", () => {
    it("admin creates a flash sale", async () => {
      const res = await request(app)
        .post("/api/flash-sales")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: `TestSale_new_${suf()}`,
          discount: 20,
          startDate: future(0.1),
          endDate: future(2),
        });

      expect(res.status).toBe(201);
      expect(res.body.sale._id).toBeDefined();
      saleId = res.body.sale._id;
    });

    it("customer gets 403", async () => {
      const res = await request(app)
        .post("/api/flash-sales")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          name: `TestSale_blocked_${suf()}`, discount: 10,
          startDate: future(0.1), endDate: future(2),
        });
      expect(res.status).toBe(403);
    });

    it("rejects when endDate is before startDate", async () => {
      const res = await request(app)
        .post("/api/flash-sales")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: `TestSale_bad_${suf()}`, discount: 10,
          startDate: future(2), endDate: future(0.5),
        });
      expect([400, 422]).toContain(res.status);
    });

    it("requires name, discount, startDate, endDate", async () => {
      const res = await request(app)
        .post("/api/flash-sales")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ discount: 10 });
      expect([400, 422]).toContain(res.status);
    });
  });

  describe("GET /api/flash-sales — admin list", () => {
    it("admin lists all flash sales", async () => {
      const res = await request(app)
        .get("/api/flash-sales")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.sales)).toBe(true);
    });

    it("GET /api/flash-sales/:id returns sale", async () => {
      const res = await request(app)
        .get(`/api/flash-sales/${saleId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.sale._id).toBe(saleId);
    });

    it("returns 404 for unknown id", async () => {
      const res = await request(app)
        .get(`/api/flash-sales/${new mongoose.Types.ObjectId()}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/flash-sales/:id/medicines — add medicines", () => {
    it("admin adds medicines to flash sale", async () => {
      const res = await request(app)
        .post(`/api/flash-sales/${saleId}/medicines`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ medicineIds: [medicineId] });
      expect(res.status).toBe(200);
      expect(res.body.sale.medicines).toContain(medicineId);
    });

    it("delete /api/flash-sales/:id/medicines removes medicines", async () => {
      const res = await request(app)
        .delete(`/api/flash-sales/${saleId}/medicines`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ medicineIds: [medicineId] });
      expect(res.status).toBe(200);
      expect(res.body.sale.medicines).not.toContain(medicineId);
    });
  });

  describe("PATCH /api/flash-sales/:id/toggle — activate/deactivate", () => {
    it("admin can toggle the flash sale off", async () => {
      // First get the current state
      const before = await FlashSale.findById(saleId);
      const res = await request(app)
        .patch(`/api/flash-sales/${saleId}/toggle`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(!before.isActive);
    });
  });

  describe("PUT /api/flash-sales/:id — update", () => {
    it("admin can update flash sale name", async () => {
      const res = await request(app)
        .put(`/api/flash-sales/${saleId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: `TestSale_updated_${suf()}` });
      expect(res.status).toBe(200);
    });
  });

  describe("DELETE /api/flash-sales/:id", () => {
    it("admin can delete a flash sale", async () => {
      const res = await request(app)
        .delete(`/api/flash-sales/${saleId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });

    it("returns 404 for already-deleted sale", async () => {
      const res = await request(app)
        .delete(`/api/flash-sales/${saleId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });
});
