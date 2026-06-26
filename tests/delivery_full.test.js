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

describe("Delivery System — full coverage", () => {
  let adminToken, driverToken, driverId, customerToken, customerId;
  let zoneId, orderId;

  beforeAll(async () => {
    const s = suf();

    const adminRes = await request(app).post("/api/auth/register").send({
      name: "Del Admin2", email: `del_admin2_${s}@pharmacy-test.com`,
      password: "Password123!", role: "admin", adminSecret: ADMIN_SECRET,
    });
    adminToken = adminRes.body.accessToken;

    const drvRes = await request(app).post("/api/auth/register").send({
      name: "Driver2", email: `driver2_${s}@pharmacy-test.com`,
      password: "Password123!", role: "delivery", adminSecret: ADMIN_SECRET,
    });
    driverToken = drvRes.body.accessToken;
    driverId    = drvRes.body.user?.id;

    const custRes = await request(app).post("/api/auth/register").send({
      name: "Del Cust2", email: `del_cust2_${s}@pharmacy-test.com`,
      password: "Password123!",
    });
    customerToken = custRes.body.accessToken;
    customerId    = custRes.body.user?.id;

    const cat = await Category.create({ name: `DelCat2_${s}` });
    const med = await Medicine.create({
      name: `DelMed2_${s}`, price: 60, stock: 20,
      category: cat._id, requiresPrescription: false,
    });

    const zone = await DeliveryZone.create({
      name: `DelZone2_${s}`,
      cities: ["TestCity"],
      deliveryFee: 15,
      freeDeliveryThreshold: 200,
      polygon: [
        { lat: 0,  lng: 0  },
        { lat: 0,  lng: 10 },
        { lat: 10, lng: 10 },
        { lat: 10, lng: 0  },
      ],
    });
    zoneId = zone._id.toString();

    const order = await Order.create({
      orderNumber:    `ORD-DF-${s}`,
      user:           customerId,
      items:          [{ medicine: med._id, name: med.name, quantity: 1, price: 60 }],
      subtotal:       60,
      total:          60,
      status:         "confirmed",
      paymentMethod:  "cash",
      shippingAddress: { fullName: "DL Test", phone: "0500000020", street: "St", city: "TestCity", country: "SA" },
    });
    orderId = order._id.toString();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
    await DeliveryZone.deleteMany({ name: /^DelZone2_/ });
    await Order.deleteMany({ "shippingAddress.phone": "0500000020" });
    await Medicine.deleteMany({ name: /^DelMed2_/ });
    await Category.deleteMany({ name: /^DelCat2_/ });
  });

  // ─── Polygon zone support in calculateFee ─────────────────────────────────

  describe("POST /api/delivery/calculate-fee — lat/lng matching", () => {
    it("matches zone by lat/lng coordinates inside polygon", async () => {
      const res = await request(app)
        .post("/api/delivery/calculate-fee")
        .send({ lat: 5, lng: 5, orderAmount: 50 });
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
      expect(res.body.deliveryFee).toBe(15);
    });

    it("returns available=false for coordinates outside all polygons", async () => {
      const res = await request(app)
        .post("/api/delivery/calculate-fee")
        .send({ lat: 50, lng: 50, orderAmount: 50 });
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
    });

    it("returns 0 fee when order meets free threshold via lat/lng", async () => {
      const res = await request(app)
        .post("/api/delivery/calculate-fee")
        .send({ lat: 5, lng: 5, orderAmount: 250 });
      expect(res.status).toBe(200);
      expect(res.body.deliveryFee).toBe(0);
    });

    it("returns 400 when neither city nor lat/lng provided", async () => {
      const res = await request(app)
        .post("/api/delivery/calculate-fee")
        .send({ orderAmount: 100 });
      expect(res.status).toBe(400);
    });
  });

  // ─── Admin: list available drivers ────────────────────────────────────────

  describe("GET /api/delivery/drivers", () => {
    it("admin gets available drivers list", async () => {
      const res = await request(app)
        .get("/api/delivery/drivers")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.drivers)).toBe(true);
    });

    it("customer gets 403", async () => {
      const res = await request(app)
        .get("/api/delivery/drivers")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
    });
  });

  // ─── Driver: update location ──────────────────────────────────────────────

  describe("PATCH /api/delivery/driver/location", () => {
    it("driver can update their GPS location", async () => {
      const res = await request(app)
        .patch("/api/delivery/driver/location")
        .set("Authorization", `Bearer ${driverToken}`)
        .send({ lat: 24.7136, lng: 46.6753 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.location.lat).toBe(24.7136);
      expect(res.body.location.lng).toBe(46.6753);
    });

    it("returns 400 when lat or lng missing", async () => {
      const res = await request(app)
        .patch("/api/delivery/driver/location")
        .set("Authorization", `Bearer ${driverToken}`)
        .send({ lat: 24.7136 });
      expect(res.status).toBe(400);
    });

    it("customer gets 403", async () => {
      const res = await request(app)
        .patch("/api/delivery/driver/location")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ lat: 1, lng: 2 });
      expect(res.status).toBe(403);
    });

    it("requires auth", async () => {
      const res = await request(app)
        .patch("/api/delivery/driver/location")
        .send({ lat: 1, lng: 2 });
      expect(res.status).toBe(401);
    });
  });

  // ─── Driver: update status ────────────────────────────────────────────────

  describe("PATCH /api/delivery/driver/status", () => {
    it("driver can set status to available", async () => {
      const res = await request(app)
        .patch("/api/delivery/driver/status")
        .set("Authorization", `Bearer ${driverToken}`)
        .send({ status: "available" });
      expect(res.status).toBe(200);
      expect(res.body.driverStatus).toBe("available");
    });

    it("driver can go offline", async () => {
      const res = await request(app)
        .patch("/api/delivery/driver/status")
        .set("Authorization", `Bearer ${driverToken}`)
        .send({ status: "offline" });
      expect(res.status).toBe(200);
      expect(res.body.driverStatus).toBe("offline");
    });

    it("returns 400 for invalid status value", async () => {
      const res = await request(app)
        .patch("/api/delivery/driver/status")
        .set("Authorization", `Bearer ${driverToken}`)
        .send({ status: "superfast" });
      expect(res.status).toBe(400);
    });

    it("returns 400 when trying to self-mark busy without an active order", async () => {
      const res = await request(app)
        .patch("/api/delivery/driver/status")
        .set("Authorization", `Bearer ${driverToken}`)
        .send({ status: "busy" });
      expect(res.status).toBe(400);
    });

    it("customer gets 403", async () => {
      const res = await request(app)
        .patch("/api/delivery/driver/status")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ status: "available" });
      expect(res.status).toBe(403);
    });
  });

  // ─── Assign driver and mark delivered flow ────────────────────────────────

  describe("Full assign-driver → mark-delivered flow", () => {
    beforeAll(async () => {
      // Ensure driver is available before assigning
      await User.findByIdAndUpdate(driverId, { driverStatus: "available" });
    });

    it("admin assigns driver — order becomes shipped, driver becomes busy", async () => {
      const res = await request(app)
        .post("/api/delivery/assign-driver")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ orderId, driverId });
      expect(res.status).toBe(200);
      expect(res.body.order.status).toBe("shipped");

      const driver = await User.findById(driverId);
      expect(driver.driverStatus).toBe("busy");
    });

    it("cannot assign already-busy driver to another order", async () => {
      const res = await request(app)
        .post("/api/delivery/assign-driver")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ orderId, driverId }); // same order, same busy driver
      expect(res.status).toBe(400);
    });

    it("driver marks delivered — status=delivered, driver becomes available", async () => {
      const res = await request(app)
        .patch(`/api/delivery/orders/${orderId}/delivered`)
        .set("Authorization", `Bearer ${driverToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const [order, driver] = await Promise.all([
        Order.findById(orderId),
        User.findById(driverId),
      ]);
      expect(order.status).toBe("delivered");
      expect(driver.driverStatus).toBe("available");
    });
  });

  // ─── Order tracking with driver location ─────────────────────────────────

  describe("GET /api/orders/:id/track — enriched tracking", () => {
    it("returns timeline, driver info, and ETA", async () => {
      const res = await request(app)
        .get(`/api/orders/${orderId}/track`)
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.tracking.timeline).toBeDefined();
      expect(Array.isArray(res.body.tracking.timeline)).toBe(true);
      expect(res.body.tracking.status).toBe("delivered");
    });
  });
});
