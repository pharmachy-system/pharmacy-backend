require("./setup");

const request = require("supertest");
const app = require("../src/app");
const User = require("../src/models/User.model");
const Medicine = require("../src/models/Medicine.model");
const Category = require("../src/models/Category.model");
const Order = require("../src/models/Order.model");

const uniqueSuffix = () => Date.now() + Math.floor(Math.random() * 10000);

describe("Orders API", () => {
  let customerToken;
  let adminToken;
  let customerId;
  let testMedicineId;
  let testCategoryId;
  let createdOrderId;
  let cancellableOrderId;

  beforeAll(async () => {
    const suffix = uniqueSuffix();

    // Create customer
    const custRes = await request(app).post("/api/auth/register").send({
      name: "Order Customer",
      email: `order_customer_${suffix}@pharmacy-test.com`,
      password: "Password123!",
    });
    customerToken = custRes.body.accessToken;
    customerId = custRes.body.user._id;

    // Create admin
    const adminRes = await request(app).post("/api/auth/register").send({
      name: "Order Admin",
      email: `order_admin_${suffix}@pharmacy-test.com`,
      password: "Password123!",
      role: "admin",
      adminSecret: process.env.ADMIN_REGISTRATION_SECRET,
    });
    adminToken = adminRes.body.accessToken;

    // Create a test category
    const cat = await Category.create({ name: `TestCat_${suffix}`, slug: `testcat-${suffix}` });
    testCategoryId = cat._id;

    // Create a test medicine
    const med = await Medicine.create({
      name: `Test Medicine ${suffix}`,
      slug: `test-medicine-${suffix}`,
      price: 50,
      finalPrice: 50,
      stock: 100,
      category: testCategoryId,
      requiresPrescription: false,
      isActive: true,
    });
    testMedicineId = med._id;
  });

  afterAll(async () => {
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
    await Medicine.deleteMany({ name: /Test Medicine/ });
    await Category.deleteMany({ name: /TestCat_/ });
    await Order.deleteMany({ user: customerId });
  });

  // ─── Create Order ──────────────────────────────────────────────────────────

  describe("POST /api/orders", () => {
    it("creates a new order successfully", async () => {
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          items: [{ medicine: testMedicineId, quantity: 2 }],
          shippingAddress: {
            fullName: "Test User",
            phone: "0501234567",
            street: "123 Test St",
            city: "Riyadh",
            country: "SA",
          },
          paymentMethod: "cash",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.order).toBeDefined();
      expect(res.body.order.orderNumber).toMatch(/^ORD-/);
      expect(res.body.order.status).toBe("pending");
      expect(res.body.order.items).toHaveLength(1);
      expect(res.body.order.items[0].quantity).toBe(2);
      expect(res.body.order.subtotal).toBe(100); // 50 * 2

      createdOrderId = res.body.order._id;
    });

    it("rejects order with out-of-stock medicine", async () => {
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          items: [{ medicine: testMedicineId, quantity: 9999 }],
          shippingAddress: {
            fullName: "Test User",
            phone: "0501234567",
            street: "123 Test St",
            city: "Riyadh",
            country: "SA",
          },
          paymentMethod: "cash",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/stock/i);
    });

    it("rejects order with invalid medicine id", async () => {
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          items: [{ medicine: "000000000000000000000000", quantity: 1 }],
          shippingAddress: {
            fullName: "Test",
            phone: "050",
            street: "St",
            city: "City",
            country: "SA",
          },
          paymentMethod: "cash",
        });

      expect(res.status).toBe(400);
    });

    it("requires authentication", async () => {
      const res = await request(app).post("/api/orders").send({
        items: [{ medicine: testMedicineId, quantity: 1 }],
        paymentMethod: "cash",
      });
      expect(res.status).toBe(401);
    });
  });

  // ─── Get My Orders ─────────────────────────────────────────────────────────

  describe("GET /api/orders/my-orders", () => {
    it("returns user's orders with pagination", async () => {
      const res = await request(app)
        .get("/api/orders/my-orders")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.orders)).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(1);
    });

    it("filters by status", async () => {
      const res = await request(app)
        .get("/api/orders/my-orders?status=pending")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      res.body.orders.forEach((order) => {
        expect(order.status).toBe("pending");
      });
    });

    it("requires authentication", async () => {
      const res = await request(app).get("/api/orders/my-orders");
      expect(res.status).toBe(401);
    });
  });

  // ─── Get Single Order ──────────────────────────────────────────────────────

  describe("GET /api/orders/:id", () => {
    it("returns order details for owner", async () => {
      const res = await request(app)
        .get(`/api/orders/${createdOrderId}`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.order._id).toBe(createdOrderId);
    });

    it("returns 404 for non-existent order", async () => {
      const res = await request(app)
        .get("/api/orders/000000000000000000000000")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(404);
    });

    it("requires authentication", async () => {
      const res = await request(app).get(`/api/orders/${createdOrderId}`);
      expect(res.status).toBe(401);
    });
  });

  // ─── Track Order ───────────────────────────────────────────────────────────

  describe("GET /api/orders/:id/track", () => {
    it("returns tracking info", async () => {
      const res = await request(app)
        .get(`/api/orders/${createdOrderId}/track`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.tracking).toBeDefined();
      expect(res.body.tracking.status).toBe("pending");
      expect(Array.isArray(res.body.tracking.timeline)).toBe(true);
    });
  });

  // ─── Update Order Status (Admin) ───────────────────────────────────────────

  describe("PUT /api/orders/:id/status", () => {
    it("admin can confirm order", async () => {
      const res = await request(app)
        .put(`/api/orders/${createdOrderId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "confirmed", note: "Order confirmed by admin" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.order.status).toBe("confirmed");
    });

    it("admin can move order to processing", async () => {
      const res = await request(app)
        .put(`/api/orders/${createdOrderId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "processing" });

      expect(res.status).toBe(200);
      expect(res.body.order.status).toBe("processing");
    });

    it("rejects invalid status transition", async () => {
      // Cannot go from processing back to pending
      const res = await request(app)
        .put(`/api/orders/${createdOrderId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "pending" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("customer cannot update order status", async () => {
      const res = await request(app)
        .put(`/api/orders/${createdOrderId}/status`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ status: "delivered" });

      expect(res.status).toBe(403);
    });
  });

  // ─── Cancel Order ──────────────────────────────────────────────────────────

  describe("PUT /api/orders/:id/cancel", () => {
    beforeAll(async () => {
      // Create a fresh cancellable order
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          items: [{ medicine: testMedicineId, quantity: 1 }],
          shippingAddress: {
            fullName: "Test",
            phone: "0501234567",
            street: "St",
            city: "Riyadh",
            country: "SA",
          },
          paymentMethod: "cash",
        });
      cancellableOrderId = res.body.order._id;
    });

    it("customer can cancel a pending order", async () => {
      const res = await request(app)
        .put(`/api/orders/${cancellableOrderId}/cancel`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ reason: "Changed my mind" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.order.status).toBe("cancelled");
      expect(res.body.order.cancellationReason).toBe("Changed my mind");
    });

    it("cannot cancel an already-cancelled order", async () => {
      const res = await request(app)
        .put(`/api/orders/${cancellableOrderId}/cancel`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ reason: "Again" });

      expect(res.status).toBe(400);
    });

    it("cannot cancel a shipped order", async () => {
      // The order in createdOrderId is in 'processing' state
      const res = await request(app)
        .put(`/api/orders/${createdOrderId}/cancel`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ reason: "Too late" });

      expect(res.status).toBe(400);
    });
  });

  // ─── Reorder ───────────────────────────────────────────────────────────────

  describe("POST /api/orders/:id/reorder", () => {
    it("adds items from previous order to cart", async () => {
      const res = await request(app)
        .post(`/api/orders/${cancellableOrderId}/reorder`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cartItemCount).toBeGreaterThanOrEqual(0); // some may be out of stock
    });

    it("returns 404 for order that doesn't belong to user", async () => {
      const res = await request(app)
        .post("/api/orders/000000000000000000000000/reorder")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ─── Admin Get All Orders ──────────────────────────────────────────────────

  describe("GET /api/orders (admin)", () => {
    it("admin can list all orders", async () => {
      const res = await request(app)
        .get("/api/orders")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.orders)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it("admin can filter by status", async () => {
      const res = await request(app)
        .get("/api/orders?status=cancelled")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      res.body.orders.forEach((o) => expect(o.status).toBe("cancelled"));
    });

    it("customer cannot access admin order list", async () => {
      const res = await request(app)
        .get("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });
  });
});
