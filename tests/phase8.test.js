/**
 * Phase 8 — Production Hardening & Observability
 *
 * Covers:
 *  - Enhanced /health endpoint: DB status, memory, uptime
 *  - GET /api/admin/system: process info, integration status
 *  - Access control on /api/admin/system
 *  - /api/v1/admin/system versioning
 */
require("./setup");

const request = require("supertest");
const app     = require("../src/app");
const User    = require("../src/models/User.model");
const mongoose = require("mongoose");

const ADMIN_SECRET = process.env.ADMIN_REGISTRATION_SECRET;
const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;
const s = suf();

let adminToken, customerToken;

beforeAll(async () => {
  const [adminRes, custRes] = await Promise.all([
    request(app).post("/api/auth/register").send({
      name: `P8Admin_${s}`, email: `p8admin_${s}@test.com`,
      password: "Test1234!", role: "admin", adminSecret: ADMIN_SECRET,
    }),
    request(app).post("/api/auth/register").send({
      name: `P8Cust_${s}`, email: `p8cust_${s}@test.com`,
      password: "Test1234!",
    }),
  ]);
  adminToken    = adminRes.body.accessToken;
  customerToken = custRes.body.accessToken;
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 1) return;
  await User.deleteMany({ email: /p8(admin|cust)_.*@test\.com/ });
});

// ─── /health ─────────────────────────────────────────────────────────────────
describe("GET /health", () => {
  it("returns 200 with success", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("reports database connected status", async () => {
    const res = await request(app).get("/health");
    expect(res.body.database).toBeDefined();
    expect(res.body.database.status).toBe("connected");
  });

  it("includes DB ping latency in ms", async () => {
    const res = await request(app).get("/health");
    expect(typeof res.body.database.pingMs).toBe("number");
    expect(res.body.database.pingMs).toBeGreaterThanOrEqual(0);
  });

  it("includes memory usage", async () => {
    const res = await request(app).get("/health");
    expect(res.body.memory).toBeDefined();
    expect(typeof res.body.memory.heapUsedMB).toBe("number");
    expect(typeof res.body.memory.rssMB).toBe("number");
    expect(res.body.memory.heapUsedMB).toBeGreaterThan(0);
  });

  it("includes uptime in seconds", async () => {
    const res = await request(app).get("/health");
    expect(typeof res.body.uptimeSeconds).toBe("number");
    expect(res.body.uptimeSeconds).toBeGreaterThan(0);
  });

  it("includes timestamp in ISO format", async () => {
    const res = await request(app).get("/health");
    expect(res.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("includes environment", async () => {
    const res = await request(app).get("/health");
    expect(res.body.environment).toBeDefined();
  });

  it("is accessible without authentication", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });
});

// ─── /api/admin/system ───────────────────────────────────────────────────────
describe("GET /api/admin/system", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/admin/system");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    const res = await request(app)
      .get("/api/admin/system")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });

  it("admin gets 200 with system info", async () => {
    const res = await request(app)
      .get("/api/admin/system")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.system).toBeDefined();
  });

  it("system info includes Node version", async () => {
    const res = await request(app)
      .get("/api/admin/system")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.system.nodeVersion).toMatch(/^v\d+/);
  });

  it("system info includes memory breakdown", async () => {
    const res = await request(app)
      .get("/api/admin/system")
      .set("Authorization", `Bearer ${adminToken}`);
    const { memory } = res.body.system;
    expect(memory).toBeDefined();
    expect(typeof memory.heapUsedMB).toBe("number");
    expect(typeof memory.heapTotalMB).toBe("number");
    expect(typeof memory.rssMB).toBe("number");
  });

  it("system info includes database status", async () => {
    const res = await request(app)
      .get("/api/admin/system")
      .set("Authorization", `Bearer ${adminToken}`);
    const { database } = res.body.system;
    expect(database.status).toBe("connected");
    expect(typeof database.pingMs).toBe("number");
  });

  it("system info includes uptime", async () => {
    const res = await request(app)
      .get("/api/admin/system")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(typeof res.body.system.uptimeSeconds).toBe("number");
    expect(res.body.system.uptimeSeconds).toBeGreaterThan(0);
  });

  it("system info includes integration status map", async () => {
    const res = await request(app)
      .get("/api/admin/system")
      .set("Authorization", `Bearer ${adminToken}`);
    const { integrations } = res.body.system;
    expect(integrations).toBeDefined();
    expect(typeof integrations).toBe("object");
    expect("SENTRY_DSN" in integrations).toBe(true);
    expect("CLOUDINARY_CLOUD_NAME" in integrations).toBe(true);
    expect(typeof integrations.SENTRY_DSN).toBe("boolean");
  });

  it("system info includes environment", async () => {
    const res = await request(app)
      .get("/api/admin/system")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.system.environment).toBeDefined();
  });

  it("works via /api/v1 prefix", async () => {
    const res = await request(app)
      .get("/api/v1/admin/system")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.system).toBeDefined();
  });
});
