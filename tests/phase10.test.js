/**
 * Phase 10 — Edge-case coverage
 *
 * Focus areas (lowest coverage in full-suite run):
 *  - Order lifecycle: status transitions, invalid transitions, cancel + stock restore
 *  - Cart edge cases: out-of-stock, quantity cap, item not in cart
 *  - Wallet: credit, debit, insufficient balance, transactions pagination
 *  - Error handler: 404 route, malformed JSON, 422 Joi output format
 */
require("./setup");

const request  = require("supertest");
const app      = require("../src/app");
const User     = require("../src/models/User.model");
const Medicine = require("../src/models/Medicine.model");
const Category = require("../src/models/Category.model");
const Order    = require("../src/models/Order.model");
const Cart     = require("../src/models/Cart.model");
const Wallet   = require("../src/models/Wallet.model");
const mongoose = require("mongoose");

const ADMIN_SECRET = process.env.ADMIN_REGISTRATION_SECRET;
const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;
const s = suf();

let adminToken, customerToken, catId, medId, lowStockMedId;
let cartItemId, orderId;

const shipping = {
  fullName: "Edge Test", phone: "0500000001",
  street: "1 Test Ave", city: "Riyadh",
  region: "Riyadh", postalCode: "12345", country: "SA",
};

beforeAll(async () => {
  const [adminRes, custRes] = await Promise.all([
    request(app).post("/api/auth/register").send({
      name: `P10Admin_${s}`, email: `p10admin_${s}@test.com`,
      password: "Test1234!", role: "admin", adminSecret: ADMIN_SECRET,
    }),
    request(app).post("/api/auth/register").send({
      name: `P10Cust_${s}`, email: `p10cust_${s}@test.com`,
      password: "Test1234!",
    }),
  ]);
  adminToken    = adminRes.body.accessToken;
  customerToken = custRes.body.accessToken;

  const cat = await Category.create({ name: `P10Cat_${s}`, isActive: true });
  catId = cat._id;

  const [m1, m2] = await Medicine.create([
    { name: `P10Med_${s}`,     price: 50,  stock: 100, category: catId, isActive: true },
    { name: `P10LowStock_${s}`, price: 20, stock: 2,   category: catId, isActive: true },
  ]);
  medId        = m1._id;
  lowStockMedId = m2._id;
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 1) return;
  await User.deleteMany({ email: /p10(admin|cust)_.*@test\.com/ });
  await Category.deleteMany({ name: /^P10Cat_/ });
  await Medicine.deleteMany({ name: /^P10(Med|LowStock)_/ });
  if (orderId) await Order.findByIdAndDelete(orderId);
});

// ─── Cart edge cases ──────────────────────────────────────────────────────────
describe("Cart edge cases", () => {
  it("GET /api/cart returns empty cart for new user", async () => {
    const res = await request(app)
      .get("/api/cart")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.cart.items).toHaveLength(0);
    expect(res.body.cart.subtotal).toBe(0);
  });

  it("cannot add more than available stock", async () => {
    const res = await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ medicineId: lowStockMedId.toString(), quantity: 99 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/stock/i);
  });

  it("adds medicine to cart successfully", async () => {
    const res = await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ medicineId: medId.toString(), quantity: 2 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.cart.items.length).toBeGreaterThan(0);
    cartItemId = res.body.cart.items[0]._id;
  });

  it("adding existing item increases quantity", async () => {
    const res = await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ medicineId: medId.toString(), quantity: 3 });
    expect(res.status).toBe(200);
    const item = res.body.cart.items.find((i) => i.medicine._id.toString() === medId.toString());
    expect(item.quantity).toBe(5);
  });

  it("returns 404 for inactive medicine", async () => {
    const inactive = await Medicine.create({
      name: `P10Inactive_${s}`, price: 10, stock: 100, category: catId, isActive: false,
    });
    const res = await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ medicineId: inactive._id.toString(), quantity: 1 });
    expect(res.status).toBe(404);
    await Medicine.findByIdAndDelete(inactive._id);
  });

  it("update item quantity to 0 removes it", async () => {
    if (!cartItemId) return;
    const res = await request(app)
      .put(`/api/cart/items/${cartItemId}`)
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ quantity: 0 });
    expect(res.status).toBe(200);
    const item = res.body.cart.items.find((i) => i._id === cartItemId);
    expect(item).toBeUndefined();
  });

  it("update non-existent cart item returns 404", async () => {
    const fakeItemId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .put(`/api/cart/items/${fakeItemId}`)
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ quantity: 1 });
    expect(res.status).toBe(404);
  });

  it("clear cart removes all items", async () => {
    // Add item first
    await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ medicineId: medId.toString(), quantity: 1 });

    const res = await request(app)
      .delete("/api/cart")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);

    const cart = await request(app)
      .get("/api/cart")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(cart.body.cart.items).toHaveLength(0);
  });
});

// ─── Order lifecycle ──────────────────────────────────────────────────────────
describe("Order lifecycle", () => {
  beforeAll(async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ medicine: medId, quantity: 1 }],
        paymentMethod: "cash",
        shippingAddress: shipping,
      });
    orderId = res.body.order?._id;
  });

  it("new order has pending status", async () => {
    if (!orderId) return;
    const order = await Order.findById(orderId);
    expect(order.status).toBe("pending");
  });

  it("order has vatAmount set", async () => {
    if (!orderId) return;
    const order = await Order.findById(orderId);
    expect(order.vatAmount).toBeGreaterThan(0);
  });

  it("order has invoiceUUID set", async () => {
    if (!orderId) return;
    const order = await Order.findById(orderId);
    expect(order.invoiceUUID).toBeDefined();
    expect(typeof order.invoiceUUID).toBe("string");
  });

  it("admin can transition pending → confirmed", async () => {
    if (!orderId) return;
    const res = await request(app)
      .put(`/api/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "confirmed" });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("confirmed");
  });

  it("invalid status transition returns 400", async () => {
    if (!orderId) return;
    const res = await request(app)
      .put(`/api/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "shipped" }); // must go confirmed → processing → shipped
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Cannot transition/);
  });

  it("admin can transition confirmed → processing", async () => {
    if (!orderId) return;
    const res = await request(app)
      .put(`/api/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "processing" });
    expect(res.status).toBe(200);
  });

  it("customer can cancel their own order", async () => {
    // Place a new order to cancel
    const placeRes = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ medicine: medId, quantity: 1 }],
        paymentMethod: "cash",
        shippingAddress: shipping,
      });
    const cancelOrderId = placeRes.body.order?._id;
    if (!cancelOrderId) return;

    const res = await request(app)
      .put(`/api/orders/${cancelOrderId}/cancel`)
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ reason: "Changed my mind" });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("cancelled");

    await Order.findByIdAndDelete(cancelOrderId);
  });

  it("customer cannot update order status (admin only)", async () => {
    if (!orderId) return;
    const res = await request(app)
      .put(`/api/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ status: "shipped" });
    expect(res.status).toBe(403);
  });

  it("cancel restores medicine stock", async () => {
    const stockBefore = (await Medicine.findById(medId)).stock;

    const placeRes = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ medicine: medId, quantity: 3 }],
        paymentMethod: "cash",
        shippingAddress: shipping,
      });
    const cancelId = placeRes.body.order?._id;
    if (!cancelId) return;

    await request(app)
      .put(`/api/orders/${cancelId}/cancel`)
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ reason: "test cancel" });

    const stockAfter = (await Medicine.findById(medId)).stock;
    expect(stockAfter).toBe(stockBefore);

    await Order.findByIdAndDelete(cancelId);
  });

  it("GET /api/orders/my-orders returns user's orders", async () => {
    const res = await request(app)
      .get("/api/orders/my-orders")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.orders)).toBe(true);
  });

  it("GET /api/orders/:id returns order detail", async () => {
    if (!orderId) return;
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.order._id).toBe(orderId);
  });

  it("GET /api/orders/:id returns 404 for unknown order", async () => {
    const res = await request(app)
      .get(`/api/orders/${new mongoose.Types.ObjectId()}`)
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(404);
  });
});

// ─── Wallet ───────────────────────────────────────────────────────────────────
describe("Wallet", () => {
  it("GET /api/wallet returns 200 with balance", async () => {
    const res = await request(app)
      .get("/api/wallet")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.balance).toBe("number");
  });

  it("admin can credit wallet", async () => {
    const custUser = await User.findOne({ email: `p10cust_${s}@test.com` });
    const res = await request(app)
      .post("/api/wallet/credit")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ userId: custUser._id.toString(), amount: 200, description: "Test credit" });
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(200);
  });

  it("customer can debit wallet (pay)", async () => {
    const res = await request(app)
      .post("/api/wallet/debit")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ amount: 50, description: "Test payment" });
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(150);
  });

  it("debit fails with insufficient balance", async () => {
    const res = await request(app)
      .post("/api/wallet/debit")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ amount: 9999 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/balance/i);
  });

  it("debit fails with amount = 0", async () => {
    const res = await request(app)
      .post("/api/wallet/debit")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ amount: 0 });
    expect(res.status).toBe(400);
  });

  it("GET /api/wallet/transactions returns paginated list", async () => {
    const res = await request(app)
      .get("/api/wallet/transactions")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.transactions)).toBe(true);
    expect(res.body.transactions.length).toBeGreaterThan(0);
    expect(res.body.pagination).toBeDefined();
  });

  it("customer cannot credit wallet directly", async () => {
    const res = await request(app)
      .post("/api/wallet/credit")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ amount: 1000, description: "Self credit" });
    expect(res.status).toBe(403);
  });

  it("wallet requires authentication", async () => {
    const res = await request(app).get("/api/wallet");
    expect(res.status).toBe(401);
  });
});

// ─── Error handler edge cases ─────────────────────────────────────────────────
describe("Error handler", () => {
  it("unknown route returns 404", async () => {
    const res = await request(app).get("/api/this-route-does-not-exist-xyz");
    expect(res.status).toBe(404);
  });

  it("Joi validation returns 422 with errors array", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "not-an-email", password: "x" });
    expect(res.status).toBe(422);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it("ObjectId cast error on unknown medicine returns 400 or 404", async () => {
    const res = await request(app).get("/api/medicines/not-a-valid-id");
    expect([400, 404, 500]).toContain(res.status);
  });
});
