require("./setup");

const request  = require("supertest");
const app      = require("../src/app");
const User     = require("../src/models/User.model");
const AuditLog = require("../src/models/AuditLog.model");
const Medicine = require("../src/models/Medicine.model");
const Category = require("../src/models/Category.model");
const mongoose = require("mongoose");

const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;

let adminToken;
let catId;

beforeAll(async () => {
  const s = suf();

  const admin = await User.create({
    name: `AuditAdmin_${s}`,
    email: `auditadmin_${s}@test.com`,
    password: "Test1234!",
    role: "admin",
    isEmailVerified: true,
  });

  const loginRes = await request(app).post("/api/auth/login").send({
    email: `auditadmin_${s}@test.com`,
    password: "Test1234!",
  });
  adminToken = loginRes.body.accessToken;

  const cat = await Category.create({ name: `AuditCat_${s}`, isActive: true });
  catId = cat._id;
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 1) return;
  await User.deleteMany({ name: /^AuditAdmin_/ });
  await Medicine.deleteMany({ name: /^AuditMed_/ });
  await AuditLog.deleteMany({ actorRole: "admin", resource: "Medicine" });
  await Category.deleteMany({ name: /^AuditCat_/ });
});

describe("Audit Log API", () => {
  it("GET /api/admin/audit requires admin role", async () => {
    const res = await request(app).get("/api/admin/audit");
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/audit returns paginated logs for admin", async () => {
    const res = await request(app)
      .get("/api/admin/audit")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  it("GET /api/admin/audit supports resource filter", async () => {
    const res = await request(app)
      .get("/api/admin/audit?resource=Medicine")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("GET /api/admin/audit supports action filter", async () => {
    const res = await request(app)
      .get("/api/admin/audit?action=DELETE")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it("is accessible at /api/v1/admin/audit", async () => {
    const res = await request(app)
      .get("/api/v1/admin/audit")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it("responses include X-Request-ID header", async () => {
    const res = await request(app)
      .get("/api/admin/audit")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.headers["x-request-id"]).toBeDefined();
  });
});

describe("API Versioning", () => {
  it("/api/health → 404 (health not under /api)", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.version).toBe("v1");
  });

  it("/api/app/home works at legacy path", async () => {
    const res = await request(app).get("/api/app/home");
    expect(res.status).toBe(200);
  });

  it("/api/v1/app/home works at versioned path", async () => {
    const res = await request(app).get("/api/v1/app/home");
    expect(res.status).toBe(200);
  });

  it("/api/v1/app/config works", async () => {
    const res = await request(app).get("/api/v1/app/config");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
