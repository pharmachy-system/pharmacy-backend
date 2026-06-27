/**
 * Phase 4+6 tests: cache, recommendations, autocomplete, category tree,
 * loyalty tiers, recently viewed, bulk inventory ops.
 */
require("./setup");

const request  = require("supertest");
const app      = require("../src/app");
const User     = require("../src/models/User.model");
const Medicine = require("../src/models/Medicine.model");
const Category = require("../src/models/Category.model");
const mongoose = require("mongoose");

const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;
const ADMIN_SECRET = process.env.ADMIN_REGISTRATION_SECRET;

let adminToken, customerToken, catId, med1Id, med2Id;
const s = suf();

beforeAll(async () => {
  const [adminRes, custRes] = await Promise.all([
    request(app).post("/api/auth/register").send({
      name: `P4Admin_${s}`, email: `p4admin_${s}@test.com`,
      password: "Test1234!", role: "admin", adminSecret: ADMIN_SECRET,
    }),
    request(app).post("/api/auth/register").send({
      name: `P4Cust_${s}`, email: `p4cust_${s}@test.com`,
      password: "Test1234!",
    }),
  ]);
  adminToken    = adminRes.body.accessToken;
  customerToken = custRes.body.accessToken;

  const cat = await Category.create({ name: `P4Cat_${s}`, isActive: true, isFeatured: true });
  catId = cat._id;

  const [m1, m2] = await Medicine.create([
    { name: `P4Paracetamol_${s}`, price: 10, stock: 100, category: catId, isActive: true, soldCount: 50, rating: 4.5 },
    { name: `P4Ibuprofen_${s}`,   price: 15, stock: 30,  category: catId, isActive: true, soldCount: 20, rating: 4.0 },
  ]);
  med1Id = m1._id;
  med2Id = m2._id;
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 1) return;
  await User.deleteMany({ email: /p4(admin|cust)_.*@test\.com/ });
  await Category.deleteMany({ name: /^P4Cat_/ });
  await Medicine.deleteMany({ name: /^P4(Paracetamol|Ibuprofen)_/ });
});

// ─── Cache ────────────────────────────────────────────────────────────────────
describe("Response Cache", () => {
  it("first /api/app/home is a cache MISS", async () => {
    const res = await request(app).get("/api/app/home");
    expect(res.status).toBe(200);
    expect(res.headers["x-cache"]).toBe("MISS");
  });

  it("second /api/app/home is a cache HIT", async () => {
    const res = await request(app).get("/api/app/home");
    expect(res.status).toBe(200);
    expect(res.headers["x-cache"]).toBe("HIT");
  });

  it("first /api/categories is a cache MISS", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    expect(res.headers["x-cache"]).toBe("MISS");
  });

  it("second /api/categories is a cache HIT", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    expect(res.headers["x-cache"]).toBe("HIT");
  });
});

// ─── Recommendations ──────────────────────────────────────────────────────────
describe("Medicine Recommendations", () => {
  it("returns 200 with recommendations array", async () => {
    const res = await request(app).get(`/api/medicines/${med1Id}/recommendations`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.recommendations)).toBe(true);
  });

  it("does not include the source medicine in recommendations", async () => {
    const res = await request(app).get(`/api/medicines/${med1Id}/recommendations`);
    expect(res.status).toBe(200);
    const ids = res.body.recommendations.map((m) => m._id);
    expect(ids).not.toContain(med1Id.toString());
  });

  it("includes same-category medicine in recommendations", async () => {
    const res = await request(app).get(`/api/medicines/${med1Id}/recommendations`);
    expect(res.status).toBe(200);
    const ids = res.body.recommendations.map((m) => m._id.toString());
    expect(ids).toContain(med2Id.toString());
  });

  it("returns 404 for unknown medicine ID", async () => {
    const res = await request(app).get(`/api/medicines/${new mongoose.Types.ObjectId()}/recommendations`);
    expect(res.status).toBe(404);
  });

  it("includes basedOn field", async () => {
    const res = await request(app).get(`/api/medicines/${med1Id}/recommendations`);
    expect(res.body.basedOn).toBeDefined();
  });
});

// ─── Autocomplete / Suggest ───────────────────────────────────────────────────
describe("Search Suggest", () => {
  it("returns 200 with suggestions array", async () => {
    const res = await request(app).get(`/api/medicines/search/suggest?q=P4Paracetamol`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
  });

  it("returns empty array for q under 2 chars", async () => {
    const res = await request(app).get("/api/medicines/search/suggest?q=a");
    expect(res.status).toBe(200);
    expect(res.body.suggestions).toHaveLength(0);
  });

  it("matches prefix of medicine name", async () => {
    const res = await request(app).get(`/api/medicines/search/suggest?q=P4Para`);
    expect(res.status).toBe(200);
    expect(res.body.suggestions.some((m) => m.name.startsWith("P4Paracetamol"))).toBe(true);
  });

  it("is publicly accessible without token", async () => {
    const res = await request(app).get("/api/medicines/search/suggest?q=test");
    expect(res.status).toBe(200);
  });
});

// ─── Category Tree ────────────────────────────────────────────────────────────
describe("Category Tree", () => {
  it("GET /api/categories/tree returns 200", async () => {
    const res = await request(app).get("/api/categories/tree");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.tree)).toBe(true);
  });

  it("tree nodes have expected shape", async () => {
    const res = await request(app).get("/api/categories/tree");
    expect(res.status).toBe(200);
    if (res.body.tree.length > 0) {
      const node = res.body.tree[0];
      expect(node).toHaveProperty("name");
      expect(node).toHaveProperty("children");
      expect(Array.isArray(node.children)).toBe(true);
      expect(typeof node.medicineCount).toBe("number");
    }
  });

  it("is publicly accessible without token", async () => {
    const res = await request(app).get("/api/categories/tree");
    expect(res.status).toBe(200);
  });
});

// ─── Loyalty Tiers ────────────────────────────────────────────────────────────
describe("Loyalty Tiers", () => {
  it("GET /api/users/me returns loyalty tier in profile", async () => {
    const res = await request(app).get("/api/users/me").set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.loyalty).toBeDefined();
    expect(res.body.loyalty.tier).toBeDefined();
    expect(["bronze", "silver", "gold"]).toContain(res.body.loyalty.tier);
  });

  it("new user is in bronze tier", async () => {
    const res = await request(app).get("/api/users/me").set("Authorization", `Bearer ${customerToken}`);
    expect(res.body.loyalty.tier).toBe("bronze");
    expect(res.body.loyalty.multiplier).toBe(1.0);
    expect(typeof res.body.loyalty.pointsToNext).toBe("number");
  });

  it("GET /api/users/me/loyalty includes loyalty tier", async () => {
    const res = await request(app).get("/api/users/me/loyalty").set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.loyalty).toBeDefined();
    expect(res.body.loyalty.tier).toBe("bronze");
  });
});

// ─── Recently Viewed ──────────────────────────────────────────────────────────
describe("Recently Viewed", () => {
  it("GET /api/users/me/recently-viewed returns 200 when empty", async () => {
    const res = await request(app)
      .get("/api/users/me/recently-viewed")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.recentlyViewed)).toBe(true);
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/users/me/recently-viewed");
    expect(res.status).toBe(401);
  });
});

// ─── Bulk Status Update ───────────────────────────────────────────────────────
describe("Bulk Inventory Status", () => {
  it("admin can deactivate medicines in bulk", async () => {
    const res = await request(app)
      .post("/api/admin/inventory/bulk-status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ medicineIds: [med1Id, med2Id], isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.action).toBe("deactivated");
    expect(res.body.updated).toBeGreaterThan(0);
  });

  it("admin can re-activate medicines in bulk", async () => {
    const res = await request(app)
      .post("/api/admin/inventory/bulk-status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ medicineIds: [med1Id, med2Id], isActive: true });
    expect(res.status).toBe(200);
    expect(res.body.action).toBe("activated");
  });

  it("rejects empty medicineIds array", async () => {
    const res = await request(app)
      .post("/api/admin/inventory/bulk-status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ medicineIds: [], isActive: true });
    expect(res.status).toBe(400);
  });

  it("requires admin role", async () => {
    const res = await request(app)
      .post("/api/admin/inventory/bulk-status")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ medicineIds: [med1Id], isActive: false });
    expect(res.status).toBe(403);
  });
});
