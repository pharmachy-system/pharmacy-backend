require("./setup");

const request  = require("supertest");
const app      = require("../src/app");
const User     = require("../src/models/User.model");
const Medicine = require("../src/models/Medicine.model");
const Category = require("../src/models/Category.model");
const Wishlist = require("../src/models/Wishlist.model");
const mongoose = require("mongoose");

const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;

describe("Wishlist API", () => {
  let customerToken, med1Id, med2Id;

  beforeAll(async () => {
    const s = suf();
    const custRes = await request(app).post("/api/auth/register").send({
      name: "WL Customer", email: `wl_cust_${s}@pharmacy-test.com`,
      password: "Password123!",
    });
    customerToken = custRes.body.accessToken;

    const cat = await Category.create({ name: `WlCat_${s}` });
    const m1  = await Medicine.create({
      name: `WlMed1_${s}`, price: 25, stock: 10,
      category: cat._id, requiresPrescription: false,
    });
    const m2  = await Medicine.create({
      name: `WlMed2_${s}`, price: 40, stock: 0,
      category: cat._id, requiresPrescription: false,
    });
    med1Id = m1._id.toString();
    med2Id = m2._id.toString();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
    await Medicine.deleteMany({ name: /^WlMed/ });
    await Category.deleteMany({ name: /^WlCat_/ });
    await Wishlist.deleteMany({});
  });

  describe("GET /api/wishlist", () => {
    it("returns empty wishlist for new user", async () => {
      const res = await request(app)
        .get("/api/wishlist")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.items).toEqual([]);
      expect(res.body.count).toBe(0);
    });

    it("requires authentication", async () => {
      const res = await request(app).get("/api/wishlist");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/wishlist — add item", () => {
    it("adds a medicine to wishlist", async () => {
      const res = await request(app)
        .post("/api/wishlist")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ medicineId: med1Id });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
    });

    it("returns 400 when adding duplicate", async () => {
      const res = await request(app)
        .post("/api/wishlist")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ medicineId: med1Id });
      expect(res.status).toBe(400);
    });

    it("returns 404 for inactive/unknown medicine", async () => {
      const res = await request(app)
        .post("/api/wishlist")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ medicineId: new mongoose.Types.ObjectId().toString() });
      expect(res.status).toBe(404);
    });

    it("wishlist now contains the added item", async () => {
      const res = await request(app)
        .get("/api/wishlist")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.body.count).toBe(1);
      expect(res.body.items[0].medicine._id).toBe(med1Id);
    });
  });

  describe("POST /api/wishlist/move-to-cart — move in-stock item", () => {
    it("moves in-stock medicine from wishlist to cart", async () => {
      const res = await request(app)
        .post("/api/wishlist/move-to-cart")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ medicineId: med1Id });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Item should be removed from wishlist
      const wl = await request(app)
        .get("/api/wishlist")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(wl.body.count).toBe(0);
    });

    it("returns 400 for out-of-stock medicine", async () => {
      // Add out-of-stock medicine to wishlist first
      await request(app)
        .post("/api/wishlist")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ medicineId: med2Id });

      const res = await request(app)
        .post("/api/wishlist/move-to-cart")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ medicineId: med2Id });

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/wishlist/:medicineId — remove item", () => {
    beforeAll(async () => {
      // Clear any leftover wishlist items (e.g. out-of-stock med2 from move-to-cart test)
      await request(app)
        .delete("/api/wishlist")
        .set("Authorization", `Bearer ${customerToken}`);
      await request(app)
        .post("/api/wishlist")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ medicineId: med1Id });
    });

    it("removes a specific item from wishlist", async () => {
      const res = await request(app)
        .delete(`/api/wishlist/${med1Id}`)
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
    });

    it("returns 404 when item not in wishlist", async () => {
      const res = await request(app)
        .delete(`/api/wishlist/${med1Id}`)
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/wishlist — clear all", () => {
    beforeAll(async () => {
      await request(app)
        .post("/api/wishlist")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ medicineId: med1Id });
    });

    it("clears the entire wishlist", async () => {
      const res = await request(app)
        .delete("/api/wishlist")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(200);

      const wl = await request(app)
        .get("/api/wishlist")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(wl.body.count).toBe(0);
    });
  });
});
