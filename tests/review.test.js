require("./setup");

const request  = require("supertest");
const app      = require("../src/app");
const User     = require("../src/models/User.model");
const Medicine = require("../src/models/Medicine.model");
const Review   = require("../src/models/Review.model");
const Category = require("../src/models/Category.model");
const mongoose = require("mongoose");

const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;
const ADMIN_SECRET = process.env.ADMIN_REGISTRATION_SECRET;

describe("Reviews API", () => {
  let adminToken, customer1Token, customer2Token;
  let medicineId, reviewId;

  beforeAll(async () => {
    const s = suf();

    const adminRes = await request(app).post("/api/auth/register").send({
      name: "Rev Admin", email: `rev_admin_${s}@pharmacy-test.com`,
      password: "Password123!", role: "admin", adminSecret: ADMIN_SECRET,
    });
    adminToken = adminRes.body.accessToken;

    const c1Res = await request(app).post("/api/auth/register").send({
      name: "Rev Cust1", email: `rev_c1_${s}@pharmacy-test.com`,
      password: "Password123!",
    });
    customer1Token = c1Res.body.accessToken;

    const c2Res = await request(app).post("/api/auth/register").send({
      name: "Rev Cust2", email: `rev_c2_${s}@pharmacy-test.com`,
      password: "Password123!",
    });
    customer2Token = c2Res.body.accessToken;

    const cat = await Category.create({ name: `RevCat_${s}` });
    const med = await Medicine.create({
      name: `RevMed_${s}`, price: 30, stock: 50,
      category: cat._id, requiresPrescription: false,
    });
    medicineId = med._id.toString();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
    await Review.deleteMany({ comment: /TestReview/ });
    await Medicine.deleteMany({ name: /^RevMed_/ });
    await Category.deleteMany({ name: /^RevCat_/ });
  });

  // ─── Public: Get reviews for medicine ─────────────────────────────────────

  describe("GET /api/medicines/:id/reviews — public", () => {
    it("returns empty reviews for new medicine", async () => {
      const res = await request(app).get(`/api/medicines/${medicineId}/reviews`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.reviews)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });
  });

  // ─── Create review ─────────────────────────────────────────────────────────

  describe("POST /api/medicines/:id/reviews — authenticated user", () => {
    it("customer can submit a review", async () => {
      const res = await request(app)
        .post(`/api/medicines/${medicineId}/reviews`)
        .set("Authorization", `Bearer ${customer1Token}`)
        .send({ rating: 4, title: "Good product", comment: "TestReview works well" });

      expect(res.status).toBe(201);
      expect(res.body.review._id).toBeDefined();
      expect(res.body.review.status).toBe("pending");
      expect(res.body.review.isVerifiedPurchase).toBe(false);
      reviewId = res.body.review._id;
    });

    it("duplicate review for same medicine returns 400", async () => {
      const res = await request(app)
        .post(`/api/medicines/${medicineId}/reviews`)
        .set("Authorization", `Bearer ${customer1Token}`)
        .send({ rating: 5, comment: "TestReview second attempt" });
      expect(res.status).toBe(400);
    });

    it("second customer can also review", async () => {
      const res = await request(app)
        .post(`/api/medicines/${medicineId}/reviews`)
        .set("Authorization", `Bearer ${customer2Token}`)
        .send({ rating: 2, title: "Not great", comment: "TestReview below expectations" });
      expect(res.status).toBe(201);
    });

    it("requires authentication", async () => {
      const res = await request(app)
        .post(`/api/medicines/${medicineId}/reviews`)
        .send({ rating: 3, comment: "TestReview anon" });
      expect(res.status).toBe(401);
    });

    it("rejects rating out of 1-5 range", async () => {
      const res = await request(app)
        .post(`/api/medicines/${medicineId}/reviews`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ rating: 6, comment: "TestReview invalid rating" });
      expect([400, 422]).toContain(res.status);
    });
  });

  // ─── Update own review ─────────────────────────────────────────────────────

  describe("PUT /api/reviews/:id — update own review", () => {
    it("owner can update their review", async () => {
      const res = await request(app)
        .put(`/api/reviews/${reviewId}`)
        .set("Authorization", `Bearer ${customer1Token}`)
        .send({ rating: 5, comment: "TestReview updated - excellent!" });

      expect(res.status).toBe(200);
      expect(res.body.review.rating).toBe(5);
    });

    it("another user cannot update someone else's review (404)", async () => {
      const res = await request(app)
        .put(`/api/reviews/${reviewId}`)
        .set("Authorization", `Bearer ${customer2Token}`)
        .send({ rating: 1 });
      // Returns 404 (review not found for this user) or 403
      expect([403, 404]).toContain(res.status);
    });
  });

  // ─── Mark helpful ──────────────────────────────────────────────────────────

  describe("POST /api/reviews/:id/helpful — toggle vote", () => {
    it("customer can mark a review helpful", async () => {
      // First approve the review so it's visible (or test directly via model)
      await Review.findByIdAndUpdate(reviewId, { status: "approved" });

      const res = await request(app)
        .post(`/api/reviews/${reviewId}/helpful`)
        .set("Authorization", `Bearer ${customer2Token}`);

      expect(res.status).toBe(200);
      expect(res.body.voted).toBe(true);
      expect(res.body.helpfulCount).toBe(1);
    });

    it("voting again toggles it off", async () => {
      const res = await request(app)
        .post(`/api/reviews/${reviewId}/helpful`)
        .set("Authorization", `Bearer ${customer2Token}`);
      expect(res.status).toBe(200);
      expect(res.body.voted).toBe(false);
      expect(res.body.helpfulCount).toBe(0);
    });
  });

  // ─── Admin moderation ──────────────────────────────────────────────────────

  describe("GET /api/reviews/admin/all — admin only", () => {
    it("admin can list all reviews with status filter", async () => {
      const res = await request(app)
        .get("/api/reviews/admin/all?status=pending")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.reviews)).toBe(true);
    });

    it("customer gets 403", async () => {
      const res = await request(app)
        .get("/api/reviews/admin/all")
        .set("Authorization", `Bearer ${customer1Token}`);
      expect(res.status).toBe(403);
    });
  });

  describe("PATCH /api/reviews/:id/moderate — admin approve/reject", () => {
    it("admin can approve a review", async () => {
      const res = await request(app)
        .patch(`/api/reviews/${reviewId}/moderate`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "approved" });
      expect(res.status).toBe(200);
      expect(res.body.review.status).toBe("approved");
    });

    it("admin can add a reply when approving", async () => {
      const res = await request(app)
        .patch(`/api/reviews/${reviewId}/moderate`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "approved", reply: "Thank you for your review!" });
      expect(res.status).toBe(200);
      expect(res.body.review.reply).toBe("Thank you for your review!");
    });
  });

  // ─── Delete ────────────────────────────────────────────────────────────────

  describe("DELETE /api/reviews/:id", () => {
    it("owner can delete their review", async () => {
      const res = await request(app)
        .delete(`/api/reviews/${reviewId}`)
        .set("Authorization", `Bearer ${customer1Token}`);
      expect(res.status).toBe(200);
    });

    it("returns 404 when already deleted", async () => {
      const res = await request(app)
        .delete(`/api/reviews/${reviewId}`)
        .set("Authorization", `Bearer ${customer1Token}`);
      expect(res.status).toBe(404);
    });
  });
});
