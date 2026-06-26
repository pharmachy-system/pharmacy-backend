require("./setup");

const request      = require("supertest");
const app          = require("../src/app");
const User         = require("../src/models/User.model");
const Order        = require("../src/models/Order.model");
const DeliveryZone = require("../src/models/DeliveryZone.model");
const Medicine     = require("../src/models/Medicine.model");
const Category     = require("../src/models/Category.model");
const mongoose     = require("mongoose");

const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;
const ADMIN_SECRET = process.env.ADMIN_REGISTRATION_SECRET;

describe("Delivery API", () => {
  let adminToken, deliveryToken, customerToken;
  let zoneId, orderId, driverId;

  beforeAll(async () => {
    const s = suf();

    const adminRes = await request(app).post("/api/auth/register").send({
      name: "Del Admin", email: `del_admin_${s}@pharmacy-test.com`,
      password: "Password123!", role: "admin", adminSecret: ADMIN_SECRET,
    });
    adminToken = adminRes.body.accessToken;

    const delivRes = await request(app).post("/api/auth/register").send({
      name: "Del Driver", email: `del_driver_${s}@pharmacy-test.com`,
      password: "Password123!", role: "delivery", adminSecret: ADMIN_SECRET,
    });
    deliveryToken = delivRes.body.accessToken;
    driverId = delivRes.body.user.id;

    const custRes = await request(app).post("/api/auth/register").send({
      name: "Del Customer", email: `del_cust_${s}@pharmacy-test.com`,
      password: "Password123!",
    });
    customerToken = custRes.body.accessToken;
    const customerId = custRes.body.user.id;

    // Seed an order for driver-assign tests
    const cat = await Category.create({ name: `DelCat_${s}` });
    const med = await Medicine.create({
      name: `DelMed_${s}`, price: 50, stock: 10,
      category: cat._id, requiresPrescription: false,
    });
    const order = await Order.create({
      orderNumber: `ORD-DEL-${s}`,
      user: customerId,
      items: [{ medicine: med._id, name: med.name, quantity: 1, price: 50 }],
      subtotal: 50,
      total: 50,
      status: "confirmed",
      paymentMethod: "cash",
      shippingAddress: {
        fullName: "Test User", phone: "0500000001",
        street: "123 Main St", city: "Riyadh",
        country: "SA",
      },
    });
    orderId = order._id.toString();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
    await DeliveryZone.deleteMany({ name: /^TestZone_/ });
    await Order.deleteMany({ total: 50 });
    await Medicine.deleteMany({ name: /^DelMed_/ });
    await Category.deleteMany({ name: /^DelCat_/ });
  });

  // ─── Public: Zones ─────────────────────────────────────────────────────────

  describe("GET /api/delivery/zones — public", () => {
    it("returns list of active zones without auth", async () => {
      const res = await request(app).get("/api/delivery/zones");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.zones)).toBe(true);
    });
  });

  // ─── Public: Calculate fee ─────────────────────────────────────────────────

  describe("POST /api/delivery/calculate-fee — public", () => {
    beforeAll(async () => {
      // Seed a delivery zone with a known city
      const z = await DeliveryZone.create({
        name: `TestZone_seed_${suf()}`,
        cities: ["Riyadh", "riyadh"],
        deliveryFee: 15,
        freeDeliveryThreshold: 200,
      });
      zoneId = z._id.toString();
    });

    it("returns fee for a known city", async () => {
      const res = await request(app)
        .post("/api/delivery/calculate-fee")
        .send({ city: "Riyadh", orderAmount: 50 });

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
      expect(res.body.deliveryFee).toBe(15);
    });

    it("returns 0 fee when order meets free delivery threshold", async () => {
      const res = await request(app)
        .post("/api/delivery/calculate-fee")
        .send({ city: "Riyadh", orderAmount: 250 });
      expect(res.status).toBe(200);
      expect(res.body.deliveryFee).toBe(0);
    });

    it("returns available=false for city not in any zone", async () => {
      const res = await request(app)
        .post("/api/delivery/calculate-fee")
        .send({ city: "NoSuchCityXYZ", orderAmount: 100 });
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
    });
  });

  // ─── Admin: Zone CRUD ──────────────────────────────────────────────────────

  describe("Admin zone management", () => {
    it("admin can create a delivery zone", async () => {
      const res = await request(app)
        .post("/api/delivery/zones")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: `TestZone_new_${suf()}`,
          cities: ["Jeddah"],
          deliveryFee: 20,
          freeDeliveryAt: 300,
        });

      expect(res.status).toBe(201);
      expect(res.body.zone._id).toBeDefined();
      const newZoneId = res.body.zone._id;

      // Update
      const upd = await request(app)
        .put(`/api/delivery/zones/${newZoneId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: `TestZone_updated_${suf()}`, cities: ["Jeddah"], deliveryFee: 25, freeDeliveryAt: 300 });
      expect(upd.status).toBe(200);
      expect(upd.body.zone.deliveryFee).toBe(25);

      // Soft-delete
      const del = await request(app)
        .delete(`/api/delivery/zones/${newZoneId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(del.status).toBe(200);
      const z = await DeliveryZone.findById(newZoneId);
      expect(z.isActive).toBe(false);
    });

    it("customer cannot create a zone (403)", async () => {
      const res = await request(app)
        .post("/api/delivery/zones")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ name: `TestZone_blocked_${suf()}`, cities: ["Dammam"], deliveryFee: 10, freeDeliveryAt: 200 });
      expect(res.status).toBe(403);
    });

    it("GET /api/delivery/zones/:id returns zone detail", async () => {
      const res = await request(app)
        .get(`/api/delivery/zones/${zoneId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.zone._id).toBe(zoneId);
    });
  });

  // ─── Admin: Assign driver ──────────────────────────────────────────────────

  describe("POST /api/delivery/assign-driver", () => {
    it("admin assigns a driver to a confirmed order", async () => {
      const res = await request(app)
        .post("/api/delivery/assign-driver")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ orderId, driverId });

      expect(res.status).toBe(200);
      expect(res.body.order.status).toBe("shipped");
      expect(res.body.order.driver).toBe(driverId);
    });

    it("cannot assign driver to non-confirmed order", async () => {
      const res = await request(app)
        .post("/api/delivery/assign-driver")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ orderId, driverId }); // already shipped now
      expect(res.status).toBe(400);
    });
  });

  // ─── Driver routes ─────────────────────────────────────────────────────────

  describe("GET /api/delivery/my-deliveries — driver only", () => {
    it("driver can see their assigned deliveries", async () => {
      const res = await request(app)
        .get("/api/delivery/my-deliveries")
        .set("Authorization", `Bearer ${deliveryToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.orders)).toBe(true);
      expect(res.body.orders.length).toBeGreaterThan(0);
    });

    it("customer gets 403", async () => {
      const res = await request(app)
        .get("/api/delivery/my-deliveries")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe("PATCH /api/delivery/orders/:orderId/delivered — driver marks delivered", () => {
    it("driver can mark their order as delivered", async () => {
      const res = await request(app)
        .patch(`/api/delivery/orders/${orderId}/delivered`)
        .set("Authorization", `Bearer ${deliveryToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const order = await Order.findById(orderId);
      expect(order.status).toBe("delivered");
    });

    it("returns 404 when order not assigned to this driver", async () => {
      // Different driver token but same orderId (already delivered)
      const res = await request(app)
        .patch(`/api/delivery/orders/${new mongoose.Types.ObjectId()}/delivered`)
        .set("Authorization", `Bearer ${deliveryToken}`);
      expect(res.status).toBe(404);
    });
  });
});
