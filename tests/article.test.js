require("./setup");

const request  = require("supertest");
const app      = require("../src/app");
const User     = require("../src/models/User.model");
const Article  = require("../src/models/Article.model");
const mongoose = require("mongoose");

const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;
const ADMIN_SECRET = process.env.ADMIN_REGISTRATION_SECRET;

describe("Articles API", () => {
  let adminToken, pharmacistToken, customerToken;
  let articleId, articleSlug;

  beforeAll(async () => {
    const s = suf();

    const adminRes = await request(app).post("/api/auth/register").send({
      name: "Art Admin", email: `art_admin_${s}@pharmacy-test.com`,
      password: "Password123!", role: "admin", adminSecret: ADMIN_SECRET,
    });
    adminToken = adminRes.body.accessToken;

    const pharmaRes = await request(app).post("/api/auth/register").send({
      name: "Art Pharmacist", email: `art_pharma_${s}@pharmacy-test.com`,
      password: "Password123!", role: "pharmacist", adminSecret: ADMIN_SECRET,
    });
    pharmacistToken = pharmaRes.body.accessToken;

    const custRes = await request(app).post("/api/auth/register").send({
      name: "Art Customer", email: `art_cust_${s}@pharmacy-test.com`,
      password: "Password123!",
    });
    customerToken = custRes.body.accessToken;
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
    await Article.deleteMany({ title: /^TestArticle_/ });
  });

  // ─── Public GET ────────────────────────────────────────────────────────────

  describe("GET /api/articles — public listing", () => {
    beforeAll(async () => {
      // Create a published article to list
      await Article.create({
        title: `TestArticle_pub_${suf()}`,
        content: "This is the article body with enough content here.",
        author: (await User.findOne({ email: /art_admin/ }).select("_id"))._id,
        status: "published",
        publishedAt: new Date(),
      });
    });

    it("returns published articles without auth", async () => {
      const res = await request(app).get("/api/articles");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.articles)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it("accepts page and limit query params", async () => {
      const res = await request(app).get("/api/articles?page=1&limit=5");
      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(5);
    });

    it("filters by category", async () => {
      const res = await request(app).get("/api/articles?category=health_tips");
      expect(res.status).toBe(200);
    });

    it("filters by search query", async () => {
      const res = await request(app).get("/api/articles?search=article");
      expect(res.status).toBe(200);
    });
  });

  // ─── Admin POST ────────────────────────────────────────────────────────────

  describe("POST /api/articles — admin/pharmacist create", () => {
    it("admin can create a draft article", async () => {
      const res = await request(app)
        .post("/api/articles")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          title: `TestArticle_admin_${suf()}`,
          content: "Health tip content that is at least fifty characters long.",
          category: "health_tips",
          status: "draft",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.article._id).toBeDefined();
      articleId   = res.body.article._id;
      articleSlug = res.body.article.slug;
    });

    it("pharmacist can create an article", async () => {
      const res = await request(app)
        .post("/api/articles")
        .set("Authorization", `Bearer ${pharmacistToken}`)
        .send({
          title: `TestArticle_pharma_${suf()}`,
          content: "Medicine information content that is long enough for validation.",
          category: "medicine_info",
          status: "published",
        });
      expect(res.status).toBe(201);
    });

    it("customer gets 403", async () => {
      const res = await request(app)
        .post("/api/articles")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          title: `TestArticle_blocked_${suf()}`,
          content: "Customer should not create articles content here min50.",
          status: "draft",
        });
      expect(res.status).toBe(403);
    });

    it("requires auth (401 without token)", async () => {
      const res = await request(app)
        .post("/api/articles")
        .send({ title: "No auth", content: "Content without auth token here minimum fifty chars." });
      expect(res.status).toBe(401);
    });

    it("validates required title and content", async () => {
      const res = await request(app)
        .post("/api/articles")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "draft" });
      expect([400, 422]).toContain(res.status);
    });
  });

  // ─── GET by slug and ID ────────────────────────────────────────────────────

  describe("GET /api/articles/slug/:slug and /:id", () => {
    it("GET /:id returns article for valid id", async () => {
      const res = await request(app).get(`/api/articles/${articleId}`);
      expect(res.status).toBe(200);
      expect(res.body.article._id).toBe(articleId);
    });

    it("GET /slug/:slug returns published article", async () => {
      // Get a published article's slug first
      const pub = await Article.findOne({ status: "published" });
      if (!pub) return; // skip if none
      const res = await request(app).get(`/api/articles/slug/${pub.slug}`);
      expect(res.status).toBe(200);
    });

    it("returns 404 for unknown slug", async () => {
      const res = await request(app).get("/api/articles/slug/this-slug-does-not-exist-xyz");
      expect(res.status).toBe(404);
    });

    it("returns 404 for unknown id", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/api/articles/${fakeId}`);
      expect(res.status).toBe(404);
    });
  });

  // ─── PUT and DELETE ────────────────────────────────────────────────────────

  describe("PUT /api/articles/:id — admin update", () => {
    it("admin can update title and status", async () => {
      const res = await request(app)
        .put(`/api/articles/${articleId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ title: `TestArticle_updated_${suf()}`, status: "published" });

      expect(res.status).toBe(200);
      expect(res.body.article.status).toBe("published");
    });

    it("returns 404 for unknown id", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .put(`/api/articles/${fakeId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ title: `Updated title ${suf()}` });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/articles/:id — admin only", () => {
    it("pharmacist cannot delete (403)", async () => {
      const res = await request(app)
        .delete(`/api/articles/${articleId}`)
        .set("Authorization", `Bearer ${pharmacistToken}`);
      expect(res.status).toBe(403);
    });

    it("admin can delete an article", async () => {
      const res = await request(app)
        .delete(`/api/articles/${articleId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("returns 404 when deleting already-deleted article", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .delete(`/api/articles/${fakeId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });
});
