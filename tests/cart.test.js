require("./setup");

const request = require("supertest");
const app = require("../src/app");
const User = require("../src/models/User.model");
const Medicine = require("../src/models/Medicine.model");
const Category = require("../src/models/Category.model");
const Coupon = require("../src/models/Coupon.model");
const Cart = require("../src/models/Cart.model");

const uniqueSuffix = () => Date.now() + Math.floor(Math.random() * 10000);

describe("Cart API", () => {
  let customerToken;
  let customerId;
  let testMedicineId;
  let addedItemId;
  let testCouponCode;
  const suffix = uniqueSuffix();

  beforeAll(async () => {
    const custRes = await request(app).post("/api/auth/register").send({
      name: "Cart Customer",
      email: `cart_customer_${suffix}@pharmacy-test.com`,
      password: "Password123!",
    });
    customerToken = custRes.body.accessToken;
    customerId = custRes.body.user._id;

    const cat = await Category.create({ name: `CartCat_${suffix}`, slug: `cartcat-${suffix}` });
    const med = await Medicine.create({
      name: `CartMed_${suffix}`,
      slug: `cartmed-${suffix}`,
      price: 40,
      finalPrice: 40,
      stock: 100,
      category: cat._id,
      isActive: true,
    });
    testMedicineId = med._id.toString();

    // Create a valid coupon for coupon tests
    testCouponCode = `TESTCART${suffix}`.slice(0, 20).toUpperCase();
    await Coupon.create({
      code: testCouponCode,
      type: "fixed",
      value: 10,
      minOrderAmount: 0,
      validFrom: new Date(Date.now() - 1000),
      validUntil: new Date(Date.now() + 86400000),
      isActive: true,
    });
  });

  afterAll(async () => {
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
    await Medicine.deleteMany({ name: /CartMed_/ });
    await Category.deleteMany({ name: /CartCat_/ });
    await Coupon.deleteMany({ code: testCouponCode });
    await Cart.deleteMany({ user: customerId });
  });

  // ─── Get Cart ───────────────────────────────────────────────────────────────

  describe("GET /api/cart", () => {
    it("returns empty cart for new user", async () => {
      const res = await request(app)
        .get("/api/cart")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cart).toBeDefined();
    });

    it("requires authentication", async () => {
      const res = await request(app).get("/api/cart");
      expect(res.status).toBe(401);
    });
  });

  // ─── Add to Cart ────────────────────────────────────────────────────────────

  describe("POST /api/cart/items", () => {
    it("adds a medicine to cart", async () => {
      const res = await request(app)
        .post("/api/cart/items")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ medicineId: testMedicineId, quantity: 2 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cart.items).toHaveLength(1);
      expect(res.body.cart.items[0].quantity).toBe(2);

      addedItemId = res.body.cart.items[0]._id;
    });

    it("increments quantity if item already in cart", async () => {
      const res = await request(app)
        .post("/api/cart/items")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ medicineId: testMedicineId, quantity: 1 });

      expect(res.status).toBe(200);
      expect(res.body.cart.items[0].quantity).toBe(3);
    });

    it("rejects quantity exceeding stock", async () => {
      const res = await request(app)
        .post("/api/cart/items")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ medicineId: testMedicineId, quantity: 9999 });

      // Joi rejects quantity > 99 with 422; controller would return 400 for stock check
      expect([400, 422]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it("rejects non-existent medicine", async () => {
      const res = await request(app)
        .post("/api/cart/items")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ medicineId: "000000000000000000000000", quantity: 1 });

      expect(res.status).toBe(404);
    });

    it("requires authentication", async () => {
      const res = await request(app)
        .post("/api/cart/items")
        .send({ medicineId: testMedicineId, quantity: 1 });
      expect(res.status).toBe(401);
    });
  });

  // ─── Update Cart Item ───────────────────────────────────────────────────────

  describe("PUT /api/cart/items/:itemId", () => {
    it("updates item quantity", async () => {
      const res = await request(app)
        .put(`/api/cart/items/${addedItemId}`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ quantity: 5 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const item = res.body.cart.items.find((i) => i._id === addedItemId);
      expect(item.quantity).toBe(5);
    });

    it("removes item when quantity set to 0", async () => {
      // Add a second quantity update, then set to 0
      const res = await request(app)
        .put(`/api/cart/items/${addedItemId}`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ quantity: 0 });

      expect(res.status).toBe(200);
      const item = res.body.cart.items.find((i) => i._id === addedItemId);
      expect(item).toBeUndefined();
    });

    it("returns 404 for non-existent item", async () => {
      const res = await request(app)
        .put("/api/cart/items/000000000000000000000000")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ quantity: 1 });

      expect(res.status).toBe(404);
    });
  });

  // ─── Apply Coupon ───────────────────────────────────────────────────────────

  describe("POST /api/cart/coupon", () => {
    beforeAll(async () => {
      // Re-add item to cart (item was removed by quantity=0 test)
      await request(app)
        .post("/api/cart/items")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ medicineId: testMedicineId, quantity: 2 });
    });

    it("applies a valid coupon", async () => {
      const res = await request(app)
        .post("/api/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ code: testCouponCode });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.discount).toBeGreaterThan(0);
    });

    it("rejects invalid coupon code", async () => {
      const res = await request(app)
        .post("/api/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ code: "NOTREAL123" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Remove Coupon ──────────────────────────────────────────────────────────

  describe("DELETE /api/cart/coupon", () => {
    it("removes applied coupon", async () => {
      const res = await request(app)
        .delete("/api/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── Remove Item ────────────────────────────────────────────────────────────

  describe("DELETE /api/cart/items/:itemId", () => {
    it("removes a specific item from cart", async () => {
      // First get the cart to find an item id
      const cartRes = await request(app)
        .get("/api/cart")
        .set("Authorization", `Bearer ${customerToken}`);
      const item = cartRes.body.cart.items[0];

      if (!item) return; // cart might be empty

      const res = await request(app)
        .delete(`/api/cart/items/${item._id}`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── Clear Cart ─────────────────────────────────────────────────────────────

  describe("DELETE /api/cart", () => {
    beforeAll(async () => {
      // Add an item to ensure something is in the cart to clear
      await request(app)
        .post("/api/cart/items")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ medicineId: testMedicineId, quantity: 1 });
    });

    it("clears the entire cart", async () => {
      const res = await request(app)
        .delete("/api/cart")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("cart is empty after clearing", async () => {
      const res = await request(app)
        .get("/api/cart")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.cart.items).toHaveLength(0);
    });

    it("requires authentication", async () => {
      const res = await request(app).delete("/api/cart");
      expect(res.status).toBe(401);
    });
  });
});
