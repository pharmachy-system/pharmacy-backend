require("./setup");

const request  = require("supertest");
const app      = require("../src/app");
const User     = require("../src/models/User.model");
const Medicine = require("../src/models/Medicine.model");
const Category = require("../src/models/Category.model");
const mongoose = require("mongoose");

const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;
const ADMIN_SECRET = process.env.ADMIN_REGISTRATION_SECRET;

describe("Reports & Admin Dashboard API", () => {
  let adminToken, customerToken;

  beforeAll(async () => {
    const s = suf();

    const adminRes = await request(app).post("/api/auth/register").send({
      name: "Rpt Admin", email: `rpt_admin_${s}@pharmacy-test.com`,
      password: "Password123!", role: "admin", adminSecret: ADMIN_SECRET,
    });
    adminToken = adminRes.body.accessToken;

    const custRes = await request(app).post("/api/auth/register").send({
      name: "Rpt Customer", email: `rpt_cust_${s}@pharmacy-test.com`,
      password: "Password123!",
    });
    customerToken = custRes.body.accessToken;

    // Seed a few medicines for inventory reports
    const cat = await Category.create({ name: `RptCat_${s}` });
    await Medicine.create([
      {
        name: `RptMed_high_${s}`, price: 100, stock: 50,
        category: cat._id, requiresPrescription: false,
      },
      {
        name: `RptMed_low_${s}`, price: 20, stock: 2,
        category: cat._id, requiresPrescription: false,
        lowStockThreshold: 10,
      },
    ]);
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
    await Medicine.deleteMany({ name: /^RptMed_/ });
    await Category.deleteMany({ name: /^RptCat_/ });
  });

  // ==========================================================================
  // /api/reports/* — all admin only
  // ==========================================================================

  describe("GET /api/reports/* — admin only", () => {
    const authCheck = (path) =>
      it(`customer gets 403 for ${path}`, async () => {
        const res = await request(app)
          .get(path)
          .set("Authorization", `Bearer ${customerToken}`);
        expect(res.status).toBe(403);
      });

    authCheck("/api/reports/sales");
    authCheck("/api/reports/inventory");
    authCheck("/api/reports/low-stock");
    authCheck("/api/reports/revenue");
    authCheck("/api/reports/top-medicines");
  });

  describe("GET /api/reports/sales", () => {
    it("returns sales summary with pagination", async () => {
      const res = await request(app)
        .get("/api/reports/sales")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(typeof res.body.data.totalRevenue).toBe("number");
    });

    it("accepts date range filters", async () => {
      const res = await request(app)
        .get("/api/reports/sales?startDate=2024-01-01&endDate=2025-12-31")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/reports/inventory", () => {
    it("returns inventory totals and all medicines", async () => {
      const res = await request(app)
        .get("/api/reports/inventory")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.totalItems).toBeGreaterThan(0);
      expect(typeof res.body.data.totalValue).toBe("number");
    });
  });

  describe("GET /api/reports/low-stock", () => {
    it("returns medicines at or below low-stock threshold", async () => {
      const res = await request(app)
        .get("/api/reports/low-stock")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.count).toBeGreaterThan(0); // seeded RptMed_low_ has stock=2 ≤ threshold=10
    });
  });

  describe("GET /api/reports/revenue", () => {
    it("returns monthly revenue breakdown (last 12 months)", async () => {
      const res = await request(app)
        .get("/api/reports/revenue")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe("GET /api/reports/top-medicines", () => {
    it("returns top selling medicines", async () => {
      const res = await request(app)
        .get("/api/reports/top-medicines?limit=5")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ==========================================================================
  // /api/admin/dashboard/* — admin only
  // ==========================================================================

  describe("Admin Dashboard", () => {
    const authCheck = (path) =>
      it(`customer gets 403 for ${path}`, async () => {
        const res = await request(app)
          .get(path)
          .set("Authorization", `Bearer ${customerToken}`);
        expect(res.status).toBe(403);
      });

    authCheck("/api/admin/dashboard/stats");
    authCheck("/api/admin/dashboard/revenue");
    authCheck("/api/admin/dashboard/top-products");

    it("GET /api/admin/dashboard/stats returns full KPI snapshot", async () => {
      const res = await request(app)
        .get("/api/admin/dashboard/stats")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.stats.orders).toBeDefined();
      expect(res.body.stats.revenue).toBeDefined();
      expect(res.body.stats.users).toBeDefined();
      expect(res.body.stats.medicines).toBeDefined();
    });

    it("GET /api/admin/dashboard/revenue returns monthly data", async () => {
      const res = await request(app)
        .get("/api/admin/dashboard/revenue?months=6")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("GET /api/admin/dashboard/top-products returns top sellers", async () => {
      const res = await request(app)
        .get("/api/admin/dashboard/top-products")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("GET /api/admin/dashboard/order-breakdown returns status distribution", async () => {
      const res = await request(app)
        .get("/api/admin/dashboard/order-breakdown")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("GET /api/admin/dashboard/user-trend returns daily user registrations", async () => {
      const res = await request(app)
        .get("/api/admin/dashboard/user-trend?days=14")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("GET /api/admin/dashboard/recent-orders returns most recent orders", async () => {
      const res = await request(app)
        .get("/api/admin/dashboard/recent-orders?limit=5")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.orders)).toBe(true);
    });

    it("GET /api/admin/dashboard/sales-report returns category breakdown", async () => {
      const res = await request(app)
        .get("/api/admin/dashboard/sales-report")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==========================================================================
  // /api/admin/inventory/* — admin only
  // ==========================================================================

  describe("Admin Inventory", () => {
    it("GET /api/admin/inventory/summary returns totals + category breakdown", async () => {
      const res = await request(app)
        .get("/api/admin/inventory/summary")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.summary).toBeDefined();
      expect(res.body.byCategory).toBeDefined();
    });

    it("GET /api/admin/inventory/low-stock returns low-stock medicines", async () => {
      const res = await request(app)
        .get("/api/admin/inventory/low-stock")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.count).toBeGreaterThan(0);
    });

    it("GET /api/admin/inventory/expiry returns expiring + expired medicines", async () => {
      const res = await request(app)
        .get("/api/admin/inventory/expiry?days=30")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.expiring)).toBe(true);
      expect(Array.isArray(res.body.expired)).toBe(true);
    });

    it("GET /api/admin/inventory/movement returns sold quantities in period", async () => {
      const res = await request(app)
        .get("/api/admin/inventory/movement?days=30")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("POST /api/admin/inventory/bulk-stock updates medicine stock", async () => {
      const med = await Medicine.findOne({ name: /RptMed_high_/ });
      const res = await request(app)
        .post("/api/admin/inventory/bulk-stock")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          updates: [
            { medicineId: med._id.toString(), quantity: 10, operation: "add" },
          ],
        });
      expect(res.status).toBe(200);
      expect(res.body.results[0].newStock).toBe(60); // 50 + 10
    });

    it("bulk-stock: subtract operation floors at 0", async () => {
      const med = await Medicine.findOne({ name: /RptMed_low_/ });
      const res = await request(app)
        .post("/api/admin/inventory/bulk-stock")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          updates: [{ medicineId: med._id.toString(), quantity: 100, operation: "subtract" }],
        });
      expect(res.status).toBe(200);
      expect(res.body.results[0].newStock).toBe(0);
    });

    it("returns 400 with empty updates array", async () => {
      const res = await request(app)
        .post("/api/admin/inventory/bulk-stock")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ updates: [] });
      expect(res.status).toBe(400);
    });

    it("customer gets 403 on all inventory routes", async () => {
      const res = await request(app)
        .get("/api/admin/inventory/summary")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
    });
  });
});
