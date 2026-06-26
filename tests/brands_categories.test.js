require("./setup");

const request  = require("supertest");
const app      = require("../src/app");
const User     = require("../src/models/User.model");
const Brand    = require("../src/models/Brand.model");
const Category = require("../src/models/Category.model");
const mongoose = require("mongoose");

const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;
const ADMIN_SECRET = process.env.ADMIN_REGISTRATION_SECRET;

describe("Brands & Categories API", () => {
  let adminToken, customerToken;

  beforeAll(async () => {
    const s = suf();
    const adminRes = await request(app).post("/api/auth/register").send({
      name: "BC Admin", email: `bc_admin_${s}@pharmacy-test.com`,
      password: "Password123!", role: "admin", adminSecret: ADMIN_SECRET,
    });
    adminToken = adminRes.body.accessToken;

    const custRes = await request(app).post("/api/auth/register").send({
      name: "BC Customer", email: `bc_cust_${s}@pharmacy-test.com`,
      password: "Password123!",
    });
    customerToken = custRes.body.accessToken;
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
    await Brand.deleteMany({ name: /^TestBrand_/ });
    await Category.deleteMany({ name: /^TestCat_/ });
  });

  // ==========================================================================
  // Brands
  // ==========================================================================

  describe("Brands — GET (public)", () => {
    let seedBrandId;

    beforeAll(async () => {
      const b = await Brand.create({ name: `TestBrand_seed_${suf()}` });
      seedBrandId = b._id.toString();
    });

    it("GET /api/brands returns paginated brands", async () => {
      const res = await request(app).get("/api/brands");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.brands)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it("GET /api/brands/:id returns a single brand", async () => {
      const res = await request(app).get(`/api/brands/${seedBrandId}`);
      expect(res.status).toBe(200);
      expect(res.body.brand._id).toBe(seedBrandId);
    });

    it("returns 404 for unknown brand id", async () => {
      const res = await request(app).get(`/api/brands/${new mongoose.Types.ObjectId()}`);
      expect(res.status).toBe(404);
    });

    it("filters by search query", async () => {
      const res = await request(app).get("/api/brands?search=TestBrand");
      expect(res.status).toBe(200);
    });
  });

  describe("Brands — POST/PUT/DELETE (admin)", () => {
    let brandId;

    it("admin can create a brand", async () => {
      const res = await request(app)
        .post("/api/brands")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: `TestBrand_new_${suf()}`, country: "SA" });

      expect(res.status).toBe(201);
      expect(res.body.brand._id).toBeDefined();
      brandId = res.body.brand._id;
    });

    it("customer cannot create brand (403)", async () => {
      const res = await request(app)
        .post("/api/brands")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ name: `TestBrand_blocked_${suf()}` });
      expect(res.status).toBe(403);
    });

    it("unauthenticated gets 401", async () => {
      const res = await request(app)
        .post("/api/brands")
        .send({ name: `TestBrand_noauth_${suf()}` });
      expect(res.status).toBe(401);
    });

    it("admin can update a brand", async () => {
      const res = await request(app)
        .put(`/api/brands/${brandId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ description: "Updated description" });
      expect(res.status).toBe(200);
      expect(res.body.brand.description).toBe("Updated description");
    });

    it("admin can soft-delete (deactivate) brand", async () => {
      const res = await request(app)
        .delete(`/api/brands/${brandId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Soft delete: isActive=false, not removed from DB
      const b = await Brand.findById(brandId);
      expect(b.isActive).toBe(false);
    });

    it("brand name must be unique", async () => {
      const name = `TestBrand_dup_${suf()}`;
      await Brand.create({ name });
      const res = await request(app)
        .post("/api/brands")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name });
      expect([400, 409]).toContain(res.status);
    });
  });

  // ==========================================================================
  // Categories
  // ==========================================================================

  describe("Categories — GET (public)", () => {
    let seedCatId;

    beforeAll(async () => {
      const c = await Category.create({ name: `TestCat_seed_${suf()}` });
      seedCatId = c._id.toString();
    });

    it("GET /api/categories returns top-level active categories", async () => {
      const res = await request(app).get("/api/categories");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.categories)).toBe(true);
    });

    it("GET /api/categories/:id returns category + subcategories", async () => {
      const res = await request(app).get(`/api/categories/${seedCatId}`);
      expect(res.status).toBe(200);
      expect(res.body.category._id).toBe(seedCatId);
      expect(Array.isArray(res.body.subcategories)).toBe(true);
    });

    it("returns 404 for unknown category", async () => {
      const res = await request(app).get(`/api/categories/${new mongoose.Types.ObjectId()}`);
      expect(res.status).toBe(404);
    });
  });

  describe("Categories — POST/PUT/DELETE (admin)", () => {
    let catId, parentCatId;

    it("admin can create a top-level category", async () => {
      const res = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: `TestCat_new_${suf()}` });

      expect(res.status).toBe(201);
      expect(res.body.category._id).toBeDefined();
      catId = res.body.category._id;
      parentCatId = catId;
    });

    it("admin can create a sub-category", async () => {
      const res = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: `TestCat_sub_${suf()}`, parent: parentCatId });

      expect(res.status).toBe(201);
      expect(res.body.category.parent).toBe(parentCatId);
    });

    it("customer cannot create category (403)", async () => {
      const res = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ name: `TestCat_blocked_${suf()}` });
      expect(res.status).toBe(403);
    });

    it("requires name field", async () => {
      const res = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ order: 1 });
      expect([400, 422]).toContain(res.status);
    });

    it("admin can update category", async () => {
      const res = await request(app)
        .put(`/api/categories/${catId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: `TestCat_updated_${suf()}` });
      expect(res.status).toBe(200);
    });

    it("admin can soft-delete category", async () => {
      const res = await request(app)
        .delete(`/api/categories/${catId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const c = await Category.findById(catId);
      expect(c.isActive).toBe(false);
    });
  });
});
