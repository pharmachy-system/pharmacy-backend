/**
 * Phase 7 — ZATCA e-invoice tests
 *
 * Covers:
 *  - Invoice generation on order create (vatAmount, invoiceUUID fields)
 *  - GET /api/orders/:id/invoice returns correct structure
 *  - QR code is a valid base64 string
 *  - XML contains required ZATCA Phase 1 fields
 *  - Access control (owner, admin, other user)
 */
require("./setup");

const request  = require("supertest");
const app      = require("../src/app");
const Order    = require("../src/models/Order.model");
const User     = require("../src/models/User.model");
const Medicine = require("../src/models/Medicine.model");
const Category = require("../src/models/Category.model");
const mongoose = require("mongoose");
const { generateInvoice, calcVat, orderPretaxTotal } = require("../src/utils/zatca.util");

const ADMIN_SECRET = process.env.ADMIN_REGISTRATION_SECRET;
const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;
const s = suf();

let adminToken, customerToken, otherToken, catId, medId, orderId;

beforeAll(async () => {
  const [adminRes, custRes, otherRes] = await Promise.all([
    request(app).post("/api/auth/register").send({
      name: `InvAdmin_${s}`, email: `invadmin_${s}@test.com`,
      password: "Test1234!", role: "admin", adminSecret: ADMIN_SECRET,
    }),
    request(app).post("/api/auth/register").send({
      name: `InvCust_${s}`, email: `invcust_${s}@test.com`,
      password: "Test1234!",
    }),
    request(app).post("/api/auth/register").send({
      name: `InvOther_${s}`, email: `invother_${s}@test.com`,
      password: "Test1234!",
    }),
  ]);
  adminToken    = adminRes.body.accessToken;
  customerToken = custRes.body.accessToken;
  otherToken    = otherRes.body.accessToken;

  const cat = await Category.create({ name: `InvCat_${s}`, isActive: true });
  catId = cat._id;
  const med = await Medicine.create({
    name: `InvMed_${s}`, price: 100, stock: 100, category: catId, isActive: true,
  });
  medId = med._id;

  // Place an order as the customer
  const res = await request(app)
    .post("/api/orders")
    .set("Authorization", `Bearer ${customerToken}`)
    .send({
      items: [{ medicine: medId, quantity: 2 }],
      paymentMethod: "cash",
      shippingAddress: {
        fullName: "Test Buyer", phone: "0500000000",
        street: "123 Test St", city: "Riyadh",
        region: "Riyadh", postalCode: "12345", country: "SA",
      },
    });
  orderId = res.body.order?._id;
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 1) return;
  await User.deleteMany({ email: /inv(admin|cust|other)_.*@test\.com/ });
  await Category.deleteMany({ name: /^InvCat_/ });
  await Medicine.deleteMany({ name: /^InvMed_/ });
  if (orderId) await Order.findByIdAndDelete(orderId);
});

// ─── Unit: zatca.util ─────────────────────────────────────────────────────────
describe("zatca.util unit tests", () => {
  const mockOrder = {
    orderNumber: "ORD-TEST-001",
    items: [{ _id: new mongoose.Types.ObjectId(), name: "Paracetamol 500mg", price: 10, quantity: 3 }],
    subtotal: 30, deliveryFee: 5, discount: 0, couponDiscount: 0,
    createdAt: new Date("2025-01-15T10:00:00Z"),
  };

  it("calcVat computes 15% correctly", () => {
    expect(calcVat(100)).toBe(15);
    expect(calcVat(200)).toBe(30);
    expect(calcVat(33.33)).toBe(5);
  });

  it("orderPretaxTotal sums subtotal + deliveryFee", () => {
    expect(orderPretaxTotal(mockOrder)).toBe(35);
  });

  it("orderPretaxTotal deducts discounts", () => {
    expect(orderPretaxTotal({ ...mockOrder, discount: 5, couponDiscount: 5 })).toBe(25);
  });

  it("generateInvoice returns all expected fields", () => {
    const inv = generateInvoice(mockOrder, { name: "Ahmed Ali" });
    expect(inv.invoiceUUID).toBeDefined();
    expect(typeof inv.pretaxTotal).toBe("number");
    expect(typeof inv.vatAmount).toBe("number");
    expect(typeof inv.grandTotal).toBe("number");
    expect(typeof inv.qrCode).toBe("string");
    expect(typeof inv.xml).toBe("string");
  });

  it("grandTotal equals pretaxTotal + vatAmount", () => {
    const inv = generateInvoice(mockOrder, {});
    expect(inv.grandTotal).toBeCloseTo(inv.pretaxTotal + inv.vatAmount, 2);
  });

  it("QR code is valid base64", () => {
    const inv = generateInvoice(mockOrder, {});
    const decoded = Buffer.from(inv.qrCode, "base64").toString("base64");
    expect(decoded).toBe(inv.qrCode);
  });

  it("XML contains UBL invoice root", () => {
    const inv = generateInvoice(mockOrder, {});
    expect(inv.xml).toContain("<Invoice");
    expect(inv.xml).toContain("urn:oasis:names:specification:ubl:schema:xsd:Invoice-2");
  });

  it("XML contains VAT section", () => {
    const inv = generateInvoice(mockOrder, {});
    expect(inv.xml).toContain("<cbc:Percent>15.00</cbc:Percent>");
  });

  it("XML escapes special chars in item names", () => {
    const special = generateInvoice({
      ...mockOrder,
      items: [{ _id: new mongoose.Types.ObjectId(), name: "Med <A> & B", price: 10, quantity: 1 }],
    }, {});
    expect(special.xml).toContain("Med &lt;A&gt; &amp; B");
    expect(special.xml).not.toContain("<A>");
  });
});

// ─── API: GET /api/orders/:id/invoice ────────────────────────────────────────
describe("GET /api/orders/:id/invoice", () => {
  it("returns 401 without auth", async () => {
    if (!orderId) return;
    const res = await request(app).get(`/api/orders/${orderId}/invoice`);
    expect(res.status).toBe(401);
  });

  it("order owner can retrieve invoice", async () => {
    if (!orderId) return;
    const res = await request(app)
      .get(`/api/orders/${orderId}/invoice`)
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.invoice).toBeDefined();
  });

  it("admin can retrieve any invoice", async () => {
    if (!orderId) return;
    const res = await request(app)
      .get(`/api/orders/${orderId}/invoice`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.invoice.vatRate).toBe(15);
  });

  it("other user cannot retrieve invoice (403)", async () => {
    if (!orderId) return;
    const res = await request(app)
      .get(`/api/orders/${orderId}/invoice`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it("invoice response contains all required fields", async () => {
    if (!orderId) return;
    const res = await request(app)
      .get(`/api/orders/${orderId}/invoice`)
      .set("Authorization", `Bearer ${customerToken}`);
    const inv = res.body.invoice;
    expect(inv.invoiceUUID).toBeDefined();
    expect(inv.orderNumber).toBeDefined();
    expect(inv.vatRate).toBe(15);
    expect(typeof inv.vatAmount).toBe("number");
    expect(typeof inv.grandTotal).toBe("number");
    expect(typeof inv.pretaxTotal).toBe("number");
    expect(inv.currency).toBe("SAR");
    expect(typeof inv.qrCode).toBe("string");
    expect(typeof inv.xml).toBe("string");
  });

  it("QR code is valid base64", async () => {
    if (!orderId) return;
    const res = await request(app)
      .get(`/api/orders/${orderId}/invoice`)
      .set("Authorization", `Bearer ${customerToken}`);
    const qr = res.body.invoice.qrCode;
    expect(() => Buffer.from(qr, "base64")).not.toThrow();
    expect(Buffer.from(qr, "base64").toString("base64")).toBe(qr);
  });

  it("order has vatAmount stored after creation", async () => {
    if (!orderId) return;
    const order = await Order.findById(orderId);
    expect(order.vatAmount).toBeGreaterThan(0);
    expect(order.invoiceUUID).toBeDefined();
  });

  it("returns 404 for unknown order", async () => {
    const res = await request(app)
      .get(`/api/orders/${new mongoose.Types.ObjectId()}/invoice`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

// ─── API versioning ───────────────────────────────────────────────────────────
describe("Invoice via /api/v1 prefix", () => {
  it("GET /api/v1/orders/:id/invoice works", async () => {
    if (!orderId) return;
    const res = await request(app)
      .get(`/api/v1/orders/${orderId}/invoice`)
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.invoice.vatRate).toBe(15);
  });
});
