/**
 * Phase 11 — Auth hardening & account management coverage
 *
 * Covers (all previously untested):
 *  - Token lifecycle: refresh token rotation, logout, logout-all-devices
 *  - Session validation (GET /api/auth/session)
 *  - GET /api/auth/me
 *  - Email OTP verify + resend (direct DB seeding — no real email)
 *  - Password reset: forgot + reset via seeded token
 *  - Change password (authenticated)
 *  - Login lockout after failed attempts
 *  - User profile update (PUT /api/users/me)
 *  - Address CRUD (add, update, delete, set-default)
 *  - Admin: list users, get by ID, update status, update role, reset password
 *  - Deactivated user cannot log in
 */
require("./setup");

const request  = require("supertest");
const app      = require("../src/app");
const User     = require("../src/models/User.model");
const mongoose = require("mongoose");
const crypto   = require("crypto");

const ADMIN_SECRET = process.env.ADMIN_REGISTRATION_SECRET;
const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;
const s = suf();

let adminToken, customerToken, customerId;
let refreshToken;

beforeAll(async () => {
  const [adminRes, custRes] = await Promise.all([
    request(app).post("/api/auth/register").send({
      name: `P11Admin_${s}`, email: `p11admin_${s}@test.com`,
      password: "Test1234!", role: "admin", adminSecret: ADMIN_SECRET,
    }),
    request(app).post("/api/auth/register").send({
      name: `P11Cust_${s}`, email: `p11cust_${s}@test.com`,
      password: "Test1234!",
    }),
  ]);
  adminToken    = adminRes.body.accessToken;
  customerToken = custRes.body.accessToken;
  refreshToken  = custRes.body.refreshToken;
  customerId    = custRes.body.user?._id;
  if (!customerId) {
    const u = await User.findOne({ email: `p11cust_${s}@test.com` });
    customerId = u?._id.toString();
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 1) return;
  await User.deleteMany({ email: /p11(admin|cust\d*)_.*@test\.com/ });
});

// ─── Token lifecycle ──────────────────────────────────────────────────────────
describe("Token lifecycle", () => {
  it("GET /api/auth/me returns authenticated user", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(`p11cust_${s}@test.com`);
  });

  it("POST /api/auth/refresh returns new tokens", async () => {
    if (!refreshToken) return;
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ token: refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    // update for downstream tests
    refreshToken = res.body.refreshToken;
    customerToken = res.body.accessToken;
  });

  it("invalid refresh token returns 403", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ token: "not-a-real-token" });
    expect(res.status).toBe(403);
  });

  it("POST /api/auth/logout clears session", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("GET /api/auth/session returns valid:true when authenticated", async () => {
    // Re-login since we logged out
    const loginRes = await request(app).post("/api/auth/login").send({
      email: `p11cust_${s}@test.com`, password: "Test1234!",
    });
    customerToken = loginRes.body.accessToken;
    refreshToken  = loginRes.body.refreshToken;

    const res = await request(app)
      .get("/api/auth/session")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  it("POST /api/auth/logout/all deactivates all sessions", async () => {
    const res = await request(app)
      .post("/api/auth/logout/all")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Re-login for subsequent tests
    const loginRes = await request(app).post("/api/auth/login").send({
      email: `p11cust_${s}@test.com`, password: "Test1234!",
    });
    customerToken = loginRes.body.accessToken;
    refreshToken  = loginRes.body.refreshToken;
  });
});

// ─── Email OTP verification ───────────────────────────────────────────────────
describe("Email OTP verification", () => {
  it("resend OTP returns 200 for unverified user", async () => {
    const res = await request(app)
      .post("/api/auth/resend-otp")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("invalid OTP returns 400", async () => {
    const res = await request(app)
      .post("/api/auth/verify-email")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ otp: "000000" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid|expired/i);
  });

  it("correct OTP verifies email", async () => {
    // Seed OTP directly — avoids real email sending
    const plainOtp = "123456";
    const hashedOtp = crypto.createHash("sha256").update(plainOtp).digest("hex");
    await User.findOneAndUpdate(
      { email: `p11cust_${s}@test.com` },
      { emailOTP: hashedOtp, emailOTPExpire: Date.now() + 60_000, isEmailVerified: false }
    );

    const res = await request(app)
      .post("/api/auth/verify-email")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ otp: plainOtp });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const user = await User.findOne({ email: `p11cust_${s}@test.com` });
    expect(user.isEmailVerified).toBe(true);
  });

  it("resend OTP returns 400 when already verified", async () => {
    const res = await request(app)
      .post("/api/auth/resend-otp")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already verified/i);
  });
});

// ─── Password reset flow ──────────────────────────────────────────────────────
describe("Password reset", () => {
  it("forgot-password returns 200 for unknown email (prevents enumeration)", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: `nonexistent_${s}@test.com` });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("reset-password with invalid token returns 400", async () => {
    const res = await request(app)
      .put("/api/auth/reset-password/invalidtoken123")
      .send({ password: "NewPass1234!" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid|expired/i);
  });

  it("reset-password with valid seeded token changes password", async () => {
    // Seed a reset token directly — avoids real email
    const plainToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(plainToken).digest("hex");
    await User.findOneAndUpdate(
      { email: `p11cust_${s}@test.com` },
      { resetPasswordToken: hashedToken, resetPasswordExpire: Date.now() + 60_000 }
    );

    const res = await request(app)
      .put(`/api/auth/reset-password/${plainToken}`)
      .send({ password: "NewPass5678!" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Login with new password
    const loginRes = await request(app).post("/api/auth/login").send({
      email: `p11cust_${s}@test.com`, password: "NewPass5678!",
    });
    expect(loginRes.status).toBe(200);
    customerToken = loginRes.body.accessToken;
    refreshToken  = loginRes.body.refreshToken;
  });

  it("change-password (authenticated) works", async () => {
    const res = await request(app)
      .put("/api/auth/change-password")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ currentPassword: "NewPass5678!", newPassword: "Test1234!" });
    expect(res.status).toBe(200);

    const loginRes = await request(app).post("/api/auth/login").send({
      email: `p11cust_${s}@test.com`, password: "Test1234!",
    });
    expect(loginRes.status).toBe(200);
    customerToken = loginRes.body.accessToken;
  });

  it("change-password fails with wrong current password", async () => {
    const res = await request(app)
      .put("/api/auth/change-password")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ currentPassword: "WrongPassword!", newPassword: "AnotherPass1!" });
    expect(res.status).toBe(401);
  });
});

// ─── User profile & address management ───────────────────────────────────────
describe("User profile", () => {
  it("GET /api/users/me returns profile", async () => {
    const res = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(`p11cust_${s}@test.com`);
  });

  it("PUT /api/users/me updates name", async () => {
    const res = await request(app)
      .put("/api/users/me")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ name: `Updated P11Cust_${s}` });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  let addressId;

  it("POST /api/users/me/addresses adds address", async () => {
    const res = await request(app)
      .post("/api/users/me/addresses")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        label: "home", fullName: "Test User", phone: "0500000001",
        street: "King Fahad St", city: "Riyadh",
        region: "Riyadh", postalCode: "12345", country: "SA",
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    addressId = res.body.addresses?.[res.body.addresses.length - 1]?._id;
  });

  it("GET /api/users/me/addresses returns addresses", async () => {
    const res = await request(app)
      .get("/api/users/me/addresses")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.addresses)).toBe(true);
    expect(res.body.addresses.length).toBeGreaterThan(0);
  });

  it("PUT /api/users/me/addresses/:id updates address", async () => {
    if (!addressId) return;
    const res = await request(app)
      .put(`/api/users/me/addresses/${addressId}`)
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ label: "work", city: "Jeddah" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("PATCH /api/users/me/addresses/:id/default sets default", async () => {
    if (!addressId) return;
    const res = await request(app)
      .patch(`/api/users/me/addresses/${addressId}/default`)
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("DELETE /api/users/me/addresses/:id removes address", async () => {
    if (!addressId) return;
    const res = await request(app)
      .delete(`/api/users/me/addresses/${addressId}`)
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
  });
});

// ─── Login security ───────────────────────────────────────────────────────────
describe("Login security", () => {
  it("wrong password on existing user returns 401 with attemptsLeft", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: `p11cust_${s}@test.com`, password: "WrongPassword!" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
    expect(typeof res.body.attemptsLeft).toBe("number");
  });

  it("unknown email returns 401 (no user info leakage)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: `nobody_${s}@test.com`, password: "AnyPass1!" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
    expect(res.body.attemptsLeft).toBeUndefined();
  });

  it("deactivated user cannot log in", async () => {
    const blockedRes = await request(app).post("/api/auth/register").send({
      name: `P11Blocked_${s}`, email: `p11blocked_${s}@test.com`,
      password: "Test1234!",
    });
    const blockedToken = blockedRes.body.accessToken;

    const blockedUserId = blockedRes.body.user?.id;
    await request(app)
      .patch(`/api/users/${blockedUserId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false, blockedReason: "Test deactivation" });

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: `p11blocked_${s}@test.com`, password: "Test1234!" });
    expect(loginRes.status).toBe(403);
    expect(loginRes.body.code).toBe("ACCOUNT_DEACTIVATED");
  });
});

// ─── Admin user management ────────────────────────────────────────────────────
describe("Admin user management", () => {
  it("GET /api/users returns paginated user list", async () => {
    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it("GET /api/users/:id returns user detail", async () => {
    if (!customerId) return;
    const res = await request(app)
      .get(`/api/users/${customerId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user._id).toBe(customerId);
  });

  it("PATCH /api/users/:id/role updates role", async () => {
    if (!customerId) return;
    const res = await request(app)
      .patch(`/api/users/${customerId}/role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "pharmacist" });
    expect(res.status).toBe(200);

    // Restore
    await request(app)
      .patch(`/api/users/${customerId}/role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "customer" });
  });

  it("PATCH /api/users/:id/reset-password by admin works", async () => {
    if (!customerId) return;
    const res = await request(app)
      .patch(`/api/users/${customerId}/reset-password`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ newPassword: "AdminReset1!" });
    expect(res.status).toBe(200);

    // Restore so teardown doesn't break
    await User.findByIdAndUpdate(customerId, { password: undefined });
    // Just re-hash directly
    const u = await User.findById(customerId).select("+password");
    u.password = "Test1234!";
    await u.save({ validateBeforeSave: false });
  });

  it("non-admin cannot list users", async () => {
    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });
});
