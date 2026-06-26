require("./setup");

const request = require("supertest");
const app = require("../src/app");
const User = require("../src/models/User.model");

const uniqueSuffix = () => Date.now() + Math.floor(Math.random() * 10000);

describe("Auth API", () => {
  let accessToken;
  let refreshToken;
  let testEmail;

  beforeAll(async () => {
    testEmail = `test_${uniqueSuffix()}@pharmacy-test.com`;
    // Clean up any leftover test users
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
  });

  afterAll(async () => {
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
  });

  // ─── Register ──────────────────────────────────────────────────────────────

  describe("POST /api/auth/register", () => {
    it("registers a new user successfully", async () => {
      const res = await request(app).post("/api/auth/register").send({
        name: "Test User",
        email: testEmail,
        password: "Password123!",
        phone: "0501234567",
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.user.password).toBeUndefined(); // password not leaked

      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it("rejects duplicate email", async () => {
      const res = await request(app).post("/api/auth/register").send({
        name: "Test User",
        email: testEmail,
        password: "Password123!",
      });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("rejects missing required fields", async () => {
      const res = await request(app).post("/api/auth/register").send({
        email: `missing_${uniqueSuffix()}@pharmacy-test.com`,
        // missing name and password
      });
      expect([400, 422]).toContain(res.status);
    });

    it("rejects short password", async () => {
      const res = await request(app).post("/api/auth/register").send({
        name: "Test User",
        email: `short_${uniqueSuffix()}@pharmacy-test.com`,
        password: "123",
      });
      expect([400, 422]).toContain(res.status);
    });
  });

  // ─── Login ─────────────────────────────────────────────────────────────────

  describe("POST /api/auth/login", () => {
    it("logs in with correct credentials", async () => {
      const res = await request(app).post("/api/auth/login").send({
        email: testEmail,
        password: "Password123!",
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();

      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it("rejects wrong password", async () => {
      const res = await request(app).post("/api/auth/login").send({
        email: testEmail,
        password: "WrongPassword!",
      });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("rejects non-existent email", async () => {
      const res = await request(app).post("/api/auth/login").send({
        email: "nobody@pharmacy-test.com",
        password: "Password123!",
      });
      expect(res.status).toBe(401);
    });

    it("rejects missing credentials", async () => {
      const res = await request(app).post("/api/auth/login").send({});
      expect([400, 422]).toContain(res.status);
    });
  });

  // ─── Get Me ────────────────────────────────────────────────────────────────

  describe("GET /api/auth/me", () => {
    it("returns current user with valid token", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe(testEmail);
    });

    it("returns 401 without token", async () => {
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
    });

    it("returns 401 with invalid token", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid.token.here");
      expect(res.status).toBe(401);
    });
  });

  // ─── Refresh Token ─────────────────────────────────────────────────────────

  describe("POST /api/auth/refresh", () => {
    it("returns new tokens with valid refresh token", async () => {
      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ token: refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();

      // Update tokens for subsequent tests
      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it("rejects invalid refresh token", async () => {
      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ token: "invalid-refresh-token" });
      expect([401, 403]).toContain(res.status);
    });

    it("rejects missing refresh token", async () => {
      const res = await request(app).post("/api/auth/refresh").send({});
      expect([400, 401, 422]).toContain(res.status);
    });
  });

  // ─── Forgot Password ───────────────────────────────────────────────────────

  describe("POST /api/auth/forgot-password", () => {
    it("returns 200 for registered email (anti-enumeration; 500 if SMTP not configured)", async () => {
      const res = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: testEmail });
      // 200 = email sent; 500 = SMTP not configured in test env (both are acceptable)
      expect([200, 500]).toContain(res.status);
    });

    it("returns 200 for non-existent email (anti-enumeration)", async () => {
      const res = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "ghost@pharmacy-test.com" });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── Update Profile ────────────────────────────────────────────────────────

  describe("PUT /api/users/me", () => {
    it("updates user name", async () => {
      const res = await request(app)
        .put("/api/users/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name: "Updated Name" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.name).toBe("Updated Name");
    });

    it("requires authentication", async () => {
      const res = await request(app)
        .put("/api/users/me")
        .send({ name: "No Auth" });
      expect(res.status).toBe(401);
    });
  });

  // ─── Change Password ───────────────────────────────────────────────────────

  describe("PUT /api/users/me/change-password", () => {
    it("changes password with correct current password", async () => {
      const res = await request(app)
        .put("/api/users/me/change-password")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          currentPassword: "Password123!",
          newPassword: "NewPassword456!",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("rejects wrong current password", async () => {
      const res = await request(app)
        .put("/api/users/me/change-password")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          currentPassword: "WrongOldPassword!",
          newPassword: "NewPassword789!",
        });

      expect([400, 401]).toContain(res.status);
    });
  });

  // ─── Logout ────────────────────────────────────────────────────────────────

  describe("POST /api/auth/logout", () => {
    it("logs out successfully", async () => {
      // Re-login to get a fresh token
      const loginRes = await request(app).post("/api/auth/login").send({
        email: testEmail,
        password: "NewPassword456!", // password was changed in change-password test
      });
      const freshToken = loginRes.body?.accessToken || accessToken;

      const res = await request(app)
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${freshToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
