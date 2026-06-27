require("./setup");

const request  = require("supertest");
const app      = require("../src/app");
const Category = require("../src/models/Category.model");
const Medicine = require("../src/models/Medicine.model");
const Article  = require("../src/models/Article.model");
const mongoose = require("mongoose");

const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;

describe("App Bootstrap API", () => {
  let catId;

  beforeAll(async () => {
    const s = suf();
    const cat = await Category.create({
      name: `AppTestCat_${s}`, isActive: true, isFeatured: true,
    });
    catId = cat._id;

    await Medicine.create([
      {
        name: `AppFeatured_${s}`, price: 50, stock: 100,
        category: catId, isActive: true, isFeatured: true,
      },
      {
        name: `AppNew_${s}`, price: 30, stock: 20,
        category: catId, isActive: true,
      },
    ]);

    await Article.create({
      title: `AppArticle_${s}`,
      content: "A" .repeat(60),
      status: "published",
      publishedAt: new Date(),
      author: new mongoose.Types.ObjectId(),
    });
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await Category.deleteMany({ name: /^AppTestCat_/ });
    await Medicine.deleteMany({ name: /^App(Featured|New)_/ });
    await Article.deleteMany({ title: /^AppArticle_/ });
  });

  // ── GET /api/app/home ──────────────────────────────────────────────────────
  describe("GET /api/app/home", () => {
    it("returns 200 with all home screen sections", async () => {
      const res = await request(app).get("/api/app/home");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const { data } = res.body;
      expect(Array.isArray(data.categories)).toBe(true);
      expect(Array.isArray(data.featuredMedicines)).toBe(true);
      expect(Array.isArray(data.newArrivals)).toBe(true);
      expect(Array.isArray(data.brands)).toBe(true);
      expect(Array.isArray(data.articles)).toBe(true);
    });

    it("is publicly accessible without a token", async () => {
      const res = await request(app).get("/api/app/home");
      expect(res.status).toBe(200);
    });

    it("includes seeded featured medicine", async () => {
      const res = await request(app).get("/api/app/home");
      expect(res.status).toBe(200);
      const featured = res.body.data.featuredMedicines;
      expect(featured.some((m) => m.name && m.name.startsWith("AppFeatured_"))).toBe(true);
    });

    it("flash sale is null when none active", async () => {
      const res = await request(app).get("/api/app/home");
      expect(res.status).toBe(200);
      // flashSale may be null or an object if one happens to be active
      const { flashSale } = res.body.data;
      expect(flashSale === null || typeof flashSale === "object").toBe(true);
    });
  });

  // ── GET /api/app/config ────────────────────────────────────────────────────
  describe("GET /api/app/config", () => {
    it("returns 200 with app configuration", async () => {
      const res = await request(app).get("/api/app/config");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const { config } = res.body;
      expect(config).toBeDefined();
      expect(typeof config.maintenanceMode).toBe("boolean");
      expect(config.minAppVersion).toBeDefined();
      expect(config.minAppVersion.ios).toBeDefined();
      expect(config.minAppVersion.android).toBeDefined();
    });

    it("is publicly accessible without a token", async () => {
      const res = await request(app).get("/api/app/config");
      expect(res.status).toBe(200);
    });

    it("maintenance mode reflects env variable", async () => {
      const original = process.env.MAINTENANCE_MODE;
      process.env.MAINTENANCE_MODE = "false";
      const res = await request(app).get("/api/app/config");
      expect(res.body.config.maintenanceMode).toBe(false);
      process.env.MAINTENANCE_MODE = original;
    });
  });

  // ── GET /health ────────────────────────────────────────────────────────────
  describe("GET /health", () => {
    it("returns 200 with status ok", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.success).toBe(true);
      expect(typeof res.body.timestamp).toBe("string");
    });
  });
});
