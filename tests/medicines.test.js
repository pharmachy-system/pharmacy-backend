require("./setup");

const request = require("supertest");
const app = require("../src/app");
const User = require("../src/models/User.model");
const Medicine = require("../src/models/Medicine.model");
const Category = require("../src/models/Category.model");

const uniqueSuffix = () => Date.now() + Math.floor(Math.random() * 10000);

describe("Medicines API", () => {
  let adminToken;
  let customerToken;
  let testCategoryId;
  let createdMedicineId;
  let createdMedicineSlug;
  const suffix = uniqueSuffix();

  beforeAll(async () => {
    // Admin user
    const adminRes = await request(app).post("/api/auth/register").send({
      name: "Med Admin",
      email: `med_admin_${suffix}@pharmacy-test.com`,
      password: "Password123!",
      role: "admin",
      adminSecret: process.env.ADMIN_REGISTRATION_SECRET,
    });
    adminToken = adminRes.body.accessToken;

    // Customer user
    const custRes = await request(app).post("/api/auth/register").send({
      name: "Med Customer",
      email: `med_customer_${suffix}@pharmacy-test.com`,
      password: "Password123!",
    });
    customerToken = custRes.body.accessToken;

    // Category for medicines
    const cat = await Category.create({
      name: `MedTestCat_${suffix}`,
      slug: `medtestcat-${suffix}`,
    });
    testCategoryId = cat._id;
  });

  afterAll(async () => {
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
    await Medicine.deleteMany({ name: /MedTest_/ });
    await Category.deleteMany({ name: /MedTestCat_/ });
  });

  // ─── Create Medicine (admin) ────────────────────────────────────────────────

  describe("POST /api/medicines", () => {
    it("admin can create a medicine", async () => {
      const res = await request(app)
        .post("/api/medicines")
        .set("Authorization", `Bearer ${adminToken}`)
        .field("name", `MedTest_${suffix}`)
        .field("price", "25.00")
        .field("stock", "50")
        .field("category", testCategoryId.toString());

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.medicine).toBeDefined();
      expect(res.body.medicine.name).toBe(`MedTest_${suffix}`);
      expect(res.body.medicine.price).toBe(25);
      expect(res.body.medicine.stock).toBe(50);

      createdMedicineId = res.body.medicine._id;
      createdMedicineSlug = res.body.medicine.slug;
    });

    it("rejects creation without required fields", async () => {
      const res = await request(app)
        .post("/api/medicines")
        .set("Authorization", `Bearer ${adminToken}`)
        .field("name", `MedTest_Incomplete_${suffix}`);
      // missing price, stock, category

      expect(res.status).toBe(400);
    });

    it("customer cannot create a medicine", async () => {
      const res = await request(app)
        .post("/api/medicines")
        .set("Authorization", `Bearer ${customerToken}`)
        .field("name", `MedTest_Unauth_${suffix}`)
        .field("price", "10")
        .field("stock", "5")
        .field("category", testCategoryId.toString());

      expect(res.status).toBe(403);
    });

    it("requires authentication", async () => {
      const res = await request(app)
        .post("/api/medicines")
        .field("name", "UnauthedMed")
        .field("price", "10")
        .field("stock", "5");

      expect(res.status).toBe(401);
    });
  });

  // ─── List Medicines ─────────────────────────────────────────────────────────

  describe("GET /api/medicines", () => {
    it("lists medicines publicly", async () => {
      const res = await request(app).get("/api/medicines");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.medicines)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it("searches by name", async () => {
      const res = await request(app).get(`/api/medicines?search=MedTest_${suffix}`);

      expect(res.status).toBe(200);
      expect(res.body.medicines.length).toBeGreaterThanOrEqual(1);
    });

    it("filters by category", async () => {
      const res = await request(app).get(`/api/medicines?category=${testCategoryId}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.medicines)).toBe(true);
    });

    it("respects pagination", async () => {
      const res = await request(app).get("/api/medicines?page=1&limit=5");

      expect(res.status).toBe(200);
      expect(res.body.medicines.length).toBeLessThanOrEqual(5);
      expect(res.body.pagination.limit).toBe(5);
    });

    it("filters by price range", async () => {
      const res = await request(app).get("/api/medicines?minPrice=10&maxPrice=100");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.medicines)).toBe(true);
    });
  });

  // ─── Get by ID ──────────────────────────────────────────────────────────────

  describe("GET /api/medicines/:id", () => {
    it("returns medicine by ID", async () => {
      const res = await request(app).get(`/api/medicines/${createdMedicineId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.medicine._id).toBe(createdMedicineId);
    });

    it("returns 404 for non-existent ID", async () => {
      const res = await request(app).get("/api/medicines/000000000000000000000000");
      expect(res.status).toBe(404);
    });
  });

  // ─── Get by Slug ────────────────────────────────────────────────────────────

  describe("GET /api/medicines/slug/:slug", () => {
    it("returns medicine by slug", async () => {
      const res = await request(app).get(`/api/medicines/slug/${createdMedicineSlug}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.medicine.slug).toBe(createdMedicineSlug);
    });

    it("returns 404 for unknown slug", async () => {
      const res = await request(app).get("/api/medicines/slug/this-slug-does-not-exist");
      expect(res.status).toBe(404);
    });
  });

  // ─── Update Medicine ────────────────────────────────────────────────────────

  describe("PUT /api/medicines/:id", () => {
    it("admin can update a medicine", async () => {
      const res = await request(app)
        .put(`/api/medicines/${createdMedicineId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .field("price", "30.00");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.medicine.price).toBe(30);
    });

    it("customer cannot update a medicine", async () => {
      const res = await request(app)
        .put(`/api/medicines/${createdMedicineId}`)
        .set("Authorization", `Bearer ${customerToken}`)
        .field("price", "1.00");

      expect(res.status).toBe(403);
    });
  });

  // ─── Update Stock ───────────────────────────────────────────────────────────

  describe("PATCH /api/medicines/:id/stock", () => {
    it("admin can set stock", async () => {
      const res = await request(app)
        .patch(`/api/medicines/${createdMedicineId}/stock`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ quantity: 200, operation: "set" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.medicine.stock).toBe(200);
    });

    it("admin can add stock", async () => {
      const res = await request(app)
        .patch(`/api/medicines/${createdMedicineId}/stock`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ quantity: 10, operation: "add" });

      expect(res.status).toBe(200);
      expect(res.body.medicine.stock).toBe(210);
    });

    it("admin can subtract stock", async () => {
      const res = await request(app)
        .patch(`/api/medicines/${createdMedicineId}/stock`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ quantity: 10, operation: "subtract" });

      expect(res.status).toBe(200);
      expect(res.body.medicine.stock).toBe(200);
    });

    it("rejects missing quantity", async () => {
      const res = await request(app)
        .patch(`/api/medicines/${createdMedicineId}/stock`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ─── Low Stock Alert ────────────────────────────────────────────────────────

  describe("GET /api/medicines/alerts/low-stock", () => {
    it("admin can get low stock list", async () => {
      const res = await request(app)
        .get("/api/medicines/alerts/low-stock")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.medicines)).toBe(true);
    });

    it("customer cannot access low stock alerts", async () => {
      const res = await request(app)
        .get("/api/medicines/alerts/low-stock")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });
  });

  // ─── Delete Medicine ────────────────────────────────────────────────────────

  describe("DELETE /api/medicines/:id", () => {
    it("customer cannot delete a medicine", async () => {
      const res = await request(app)
        .delete(`/api/medicines/${createdMedicineId}`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    it("admin can soft-delete a medicine", async () => {
      const res = await request(app)
        .delete(`/api/medicines/${createdMedicineId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("deleted medicine no longer appears in public listing", async () => {
      const res = await request(app).get(`/api/medicines?search=MedTest_${suffix}`);
      expect(res.status).toBe(200);
      const active = res.body.medicines.filter((m) => m._id === createdMedicineId);
      expect(active).toHaveLength(0);
    });
  });
});
