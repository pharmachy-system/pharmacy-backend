/**
 * Tests for new / updated auth endpoints added in the Login & Access Flow.
 *
 * Covers:
 *   - Login new fields: userType, loginCount, isReturningUser, lastLoginAt,
 *                       attemptsLeft, error codes, rememberDevice
 *   - GET  /api/auth/session        — { valid, user, needsBiometric, isReturningUser }
 *   - POST /api/auth/guest          — short alias returning guestToken
 *   - POST /api/auth/guest/session  — also returns guestToken
 *   - Guest cart CRUD
 *   - POST /api/auth/guest/convert  — cart merge on registration
 *   - POST /api/auth/phone/send-otp   — canonical OTP send + alias paths
 *   - POST /api/auth/phone/verify-otp — verify OTP + returning-user fields
 *   - POST /api/auth/phone/resend-otp — per-user 3/hr rate limit
 *   - GET  /api/auth/biometric/status — no-auth device status check
 *   - POST /api/auth/biometric/enable + /register alias
 *   - POST /api/auth/biometric/verify — token rotation
 *   - POST /api/auth/biometric/disable
 *   - POST /api/auth/nafath/initiate
 *   - GET  /api/auth/nafath/status/:transactionId
 *   - GET  /api/auth/nafath/status/session/:sessionId  — alias route
 *   - POST /api/auth/pin/set + /pin/verify + DELETE /api/auth/pin
 *
 * Rate limiters are bypassed in NODE_ENV=test (see rateLimiter.js).
 * Controller-level limits (login lockout, OTP resend 3/hr) still apply.
 */

require("./setup");

const request  = require("supertest");
const app      = require("../src/app");
const User     = require("../src/models/User.model");
const Medicine = require("../src/models/Medicine.model");

const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;

// ─── Helper: register + login, returns tokens + meta ──────────────────────────
async function registerAndLogin(overrides = {}) {
  const email    = `auth_new_${suf()}@pharmacy-test.com`;
  const password = "Password123!";
  const deviceId = overrides.deviceId || `dev_${suf()}`;

  const res = await request(app).post("/api/auth/register").send({
    name: "Auth Test User",
    email,
    password,
    deviceId,
    platform: "ios",
    ...overrides,
  });

  if (res.status !== 201) {
    throw new Error(`registerAndLogin failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return { email, password, deviceId, accessToken: res.body.accessToken, user: res.body.user };
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

// setup.js (required above) owns the MongoMemoryServer lifecycle — all data is
// discarded when the process exits, so cleanup is optional. Guard against the
// connection already being closed by setup.js's afterAll before ours runs.
const mongoose = require("mongoose");

beforeAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
    await User.deleteMany({ email: /@phone\.pharmacy\.local$/ });
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
    await User.deleteMany({ email: /@phone\.pharmacy\.local$/ });
  }
});

// =============================================================================
// 1. Login — new response fields
// =============================================================================

describe("Login — new response fields", () => {
  let email, password;

  beforeAll(async () => {
    email    = `login_fields_${suf()}@pharmacy-test.com`;
    password = "Password123!";
    await request(app).post("/api/auth/register").send({ name: "Fields User", email, password });
  });

  it("returns userType mapped from role (customer → patient)", async () => {
    const res = await request(app).post("/api/auth/login").send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.user.userType).toBe("patient");
    expect(res.body.user.role).toBe("customer");
  });

  it("loginCount increments on each successful login", async () => {
    const r1 = await request(app).post("/api/auth/login").send({ email, password });
    const r2 = await request(app).post("/api/auth/login").send({ email, password });
    expect(r2.body.user.loginCount).toBeGreaterThan(r1.body.user.loginCount);
  });

  it("isReturningUser is false on first login, true thereafter", async () => {
    const e = `first_${suf()}@pharmacy-test.com`;
    const reg = await request(app).post("/api/auth/register").send({
      name: "First Timer", email: e, password: "Password123!",
    });
    expect(reg.status).toBe(201);
    expect(reg.body.user.isReturningUser).toBe(false);
    expect(reg.body.user.loginCount).toBe(1);

    const login = await request(app).post("/api/auth/login").send({ email: e, password: "Password123!" });
    expect(login.body.user.isReturningUser).toBe(true);
    expect(login.body.user.loginCount).toBe(2);
  });

  it("returns lastLoginAt timestamp", async () => {
    const res = await request(app).post("/api/auth/login").send({ email, password });
    expect(res.body.user.lastLoginAt).toBeTruthy();
    expect(new Date(res.body.user.lastLoginAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("returns INVALID_CREDENTIALS code + attemptsLeft on wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email, password: "WrongPass1!" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
    expect(typeof res.body.attemptsLeft).toBe("number");
  });

  it("locks account after 5 failures and returns ACCOUNT_LOCKED", async () => {
    const e = `lock_${suf()}@pharmacy-test.com`;
    await request(app).post("/api/auth/register").send({ name: "Lock", email: e, password: "Password123!" });

    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/auth/login").send({ email: e, password: "Wrong1!" });
    }
    const res = await request(app).post("/api/auth/login").send({ email: e, password: "Wrong1!" });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("ACCOUNT_LOCKED");
    expect(typeof res.body.retryAfter).toBe("number");
  });

  it("accepts rememberDevice flag without error", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email, password, rememberDevice: true, deviceId: `rem_${suf()}`,
    });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it("register response includes userType, loginCount, isReturningUser, lastLoginAt", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Fields Check", email: `fc_${suf()}@pharmacy-test.com`, password: "Password123!",
    });
    expect(res.status).toBe(201);
    expect(res.body.user.userType).toBe("patient");
    expect(res.body.user.loginCount).toBe(1);
    expect(res.body.user.isReturningUser).toBe(false);
    expect(res.body.user.lastLoginAt).toBeTruthy();
  });
});

// =============================================================================
// 2. GET /api/auth/session — updated response shape
// =============================================================================

describe("GET /api/auth/session", () => {
  let accessToken, deviceId;

  beforeAll(async () => {
    ({ accessToken, deviceId } = await registerAndLogin());
  });

  it("returns { valid, user, needsBiometric, isReturningUser }", async () => {
    const res = await request(app)
      .get("/api/auth/session")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.user).toBeDefined();
    expect(typeof res.body.needsBiometric).toBe("boolean");
    expect(typeof res.body.isReturningUser).toBe("boolean");
  });

  it("includes session metadata when deviceId query param provided", async () => {
    const res = await request(app)
      .get(`/api/auth/session?deviceId=${deviceId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.session).toBeDefined();
    expect(typeof res.body.session.biometricEnabled).toBe("boolean");
  });

  it("user payload includes userType", async () => {
    const res = await request(app)
      .get("/api/auth/session")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.body.user.userType).toBe("patient");
  });

  it("returns 401 without token", async () => {
    const res = await request(app).get("/api/auth/session");
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// 3. Guest Mode
// =============================================================================

describe("Guest Mode", () => {
  describe("POST /api/auth/guest — short alias", () => {
    it("returns guestId, guestToken (equal), and userType: guest", async () => {
      const res = await request(app).post("/api/auth/guest").send({});
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.guestId).toBeTruthy();
      expect(res.body.guestToken).toBeTruthy();
      expect(res.body.guestToken).toBe(res.body.guestId);
      expect(res.body.userType).toBe("guest");
    });

    it("accepts optional deviceId", async () => {
      const res = await request(app).post("/api/auth/guest").send({ deviceId: `gdev_${suf()}` });
      expect(res.status).toBe(201);
      expect(res.body.guestId).toBeTruthy();
    });
  });

  describe("POST /api/auth/guest/session", () => {
    it("also returns guestToken field", async () => {
      const res = await request(app).post("/api/auth/guest/session").send({});
      expect(res.status).toBe(201);
      expect(res.body.guestToken).toBeTruthy();
      expect(res.body.guestId).toBeTruthy();
      expect(res.body.guestToken).toBe(res.body.guestId);
    });
  });

  describe("Guest cart CRUD", () => {
    let guestId, medicineId;

    beforeAll(async () => {
      const gr = await request(app).post("/api/auth/guest").send({});
      guestId = gr.body.guestId;

      const med = await Medicine.create({
        name:                 `GuestMed_${suf()}`,
        price:                20,
        stock:                100,
        category:             new (require("mongoose").Types.ObjectId)(),
        requiresPrescription: false,
      });
      medicineId = med._id.toString();
    });

    it("GET /api/auth/guest/:guestId returns empty cart", async () => {
      const res = await request(app).get(`/api/auth/guest/${guestId}`);
      expect(res.status).toBe(200);
      expect(res.body.guestId).toBe(guestId);
      expect(Array.isArray(res.body.cart)).toBe(true);
      expect(res.body.itemCount).toBe(0);
    });

    it("POST /api/auth/guest/:guestId/cart adds item", async () => {
      const res = await request(app)
        .post(`/api/auth/guest/${guestId}/cart`)
        .send({ medicineId, quantity: 3 });
      expect(res.status).toBe(200);
      expect(res.body.cartItemCount).toBe(3);
    });

    it("cart reflects added item with correct total", async () => {
      const res = await request(app).get(`/api/auth/guest/${guestId}`);
      expect(res.body.itemCount).toBe(3);
      expect(res.body.cartTotal).toBeGreaterThan(0);
    });

    it("PUT /api/auth/guest/:guestId/cart/:medicineId updates quantity", async () => {
      const res = await request(app)
        .put(`/api/auth/guest/${guestId}/cart/${medicineId}`)
        .send({ quantity: 1 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const check = await request(app).get(`/api/auth/guest/${guestId}`);
      expect(check.body.itemCount).toBe(1);
    });

    it("DELETE /api/auth/guest/:guestId/cart/:medicineId removes item", async () => {
      const res = await request(app).delete(`/api/auth/guest/${guestId}/cart/${medicineId}`);
      expect(res.status).toBe(200);

      const check = await request(app).get(`/api/auth/guest/${guestId}`);
      expect(check.body.itemCount).toBe(0);
    });

    it("returns 404 for unknown guestId", async () => {
      const res = await request(app).get("/api/auth/guest/no-such-guest-id");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/auth/guest/convert", () => {
    it("converts guest to user and returns tokens + userType", async () => {
      const gr    = await request(app).post("/api/auth/guest").send({});
      const email = `convert_${suf()}@pharmacy-test.com`;

      const res = await request(app).post("/api/auth/guest/convert").send({
        guestId:  gr.body.guestId,
        name:     "Converted User",
        email,
        password: "Password123!",
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.user.userType).toBe("patient");
      expect(res.body.user.loginCount).toBe(1);
    });

    it("merges guest cart items into user cart", async () => {
      // Create guest with a cart item
      const gr    = await request(app).post("/api/auth/guest").send({});
      const med   = await Medicine.create({
        name: `ConvMed_${suf()}`, price: 10, stock: 50,
        category: new (require("mongoose").Types.ObjectId)(), requiresPrescription: false,
      });
      await request(app)
        .post(`/api/auth/guest/${gr.body.guestId}/cart`)
        .send({ medicineId: med._id.toString(), quantity: 2 });

      const res = await request(app).post("/api/auth/guest/convert").send({
        guestId:  gr.body.guestId,
        name:     "Cart Merger",
        email:    `merge_${suf()}@pharmacy-test.com`,
        password: "Password123!",
      });

      expect(res.status).toBe(201);
      expect(res.body.cartMerged).toBe(true);
    });

    it("returns 404 for unknown guestId", async () => {
      const res = await request(app).post("/api/auth/guest/convert").send({
        guestId: "no-such-guest", name: "Nobody",
        email: `nobody_${suf()}@pharmacy-test.com`, password: "Password123!",
      });
      expect(res.status).toBe(404);
    });
  });
});

// =============================================================================
// 4. Phone OTP
// =============================================================================

describe("Phone OTP", () => {
  // Generate a fresh E.164 number each call
  const freshPhone = () => `+9665${String(Math.floor(10000000 + Math.random() * 89999999))}`;

  describe("POST /api/auth/phone/send-otp", () => {
    it("sends OTP and returns expiresIn + cooldown (dev mode, no real SMS)", async () => {
      const res = await request(app)
        .post("/api/auth/phone/send-otp")
        .send({ phone: freshPhone() });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.expiresIn).toBe(300);
      expect(res.body.cooldown).toBe(60);
    });

    it("enforces 60-second per-user cooldown between sends", async () => {
      const p = freshPhone();
      await request(app).post("/api/auth/phone/send-otp").send({ phone: p });

      // Second call within 60 s — should be rate-limited by controller (not IP limiter)
      const res = await request(app).post("/api/auth/phone/send-otp").send({ phone: p });
      expect(res.status).toBe(429);
      expect(res.body.code).toBe("OTP_COOLDOWN");
      expect(typeof res.body.cooldownSeconds).toBe("number");
    });

    it("rejects missing phone", async () => {
      const res = await request(app).post("/api/auth/phone/send-otp").send({});
      expect([400, 422]).toContain(res.status);
    });

    it("same path accessible at /login/phone/send", async () => {
      const res = await request(app).post("/api/auth/login/phone/send").send({ phone: freshPhone() });
      expect(res.status).toBe(200);
    });

    it("same path accessible at /otp/send", async () => {
      const res = await request(app).post("/api/auth/otp/send").send({ phone: freshPhone() });
      expect(res.status).toBe(200);
    });
  });

  describe("POST /api/auth/phone/verify-otp", () => {
    it("verifies OTP and returns tokens + returning-user fields", async () => {
      const p = freshPhone();

      // Generate OTP directly through the model (bypasses SMS)
      let user = await User.findOne({ phone: p })
        .select("+phoneOTP +phoneOTPExpire +phoneOTPLastSent");
      if (!user) {
        user = new User({
          name:  `OTPUser_${suf()}`,
          phone: p,
          email: `${p.replace(/\D/g, "")}@phone.pharmacy.local`,
          isPhoneVerified: false,
        });
      }
      const plainOtp = user.generatePhoneOTP();
      await user.save({ validateBeforeSave: false });

      const res = await request(app)
        .post("/api/auth/phone/verify-otp")
        .send({ phone: p, otp: plainOtp });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.refreshToken).toBeTruthy();
      expect(res.body.user.isPhoneVerified).toBe(true);
      expect(res.body.user.userType).toBeTruthy();
      expect(typeof res.body.user.loginCount).toBe("number");
      expect(typeof res.body.user.isReturningUser).toBe("boolean");
      expect(res.body.user.lastLoginAt).toBeTruthy();
    });

    it("rejects wrong OTP with INVALID_OTP code", async () => {
      const p = freshPhone();
      const user = new User({
        name:  `OTPWrong_${suf()}`,
        phone: p,
        email: `${p.replace(/\D/g, "")}@phone.pharmacy.local`,
      });
      user.generatePhoneOTP();
      await user.save({ validateBeforeSave: false });

      const res = await request(app)
        .post("/api/auth/phone/verify-otp")
        .send({ phone: p, otp: "000000" });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_OTP");
    });

    it("rejects missing otp field", async () => {
      const res = await request(app)
        .post("/api/auth/phone/verify-otp")
        .send({ phone: freshPhone() });
      expect([400, 422]).toContain(res.status);
    });

    it("rejects missing phone field", async () => {
      const res = await request(app)
        .post("/api/auth/phone/verify-otp")
        .send({ otp: "123456" });
      expect([400, 422]).toContain(res.status);
    });
  });

  describe("POST /api/auth/phone/resend-otp — per-user 3/hr limit", () => {
    it("allows up to 3 resends then blocks with RESEND_LIMIT_REACHED", async () => {
      const p = freshPhone();

      // Seed user with an OTP (mimics prior /send-otp call)
      const user = new User({
        name:  `ResendUser_${suf()}`,
        phone: p,
        email: `${p.replace(/\D/g, "")}@phone.pharmacy.local`,
      });
      user.generatePhoneOTP();
      user.phoneOTPLastSent = new Date(Date.now() - 65000); // bypass 60-s cooldown
      await user.save({ validateBeforeSave: false });

      // 3 successful resends (each bypasses cooldown by resetting phoneOTPLastSent after)
      for (let i = 0; i < 3; i++) {
        const r = await request(app).post("/api/auth/phone/resend-otp").send({ phone: p });
        // Accept 200 (sent) or 429-cooldown (should not happen since we bypass between calls)
        expect([200, 429]).toContain(r.status);
        // Reset cooldown for next iteration
        await User.findOneAndUpdate(
          { phone: p },
          { $set: { phoneOTPLastSent: new Date(Date.now() - 65000) } }
        );
      }

      // 4th resend must be blocked by controller resend limit
      const blocked = await request(app).post("/api/auth/phone/resend-otp").send({ phone: p });
      expect(blocked.status).toBe(429);
      expect(blocked.body.code).toBe("RESEND_LIMIT_REACHED");
      expect(blocked.body.maxPerHour).toBe(3);
    });
  });
});

// =============================================================================
// 5. Biometric
// =============================================================================

describe("Biometric", () => {
  let accessToken, deviceId, biometricToken;

  beforeAll(async () => {
    deviceId = `bio_${suf()}`;
    ({ accessToken } = await registerAndLogin({ deviceId }));
  });

  describe("GET /api/auth/biometric/status", () => {
    it("returns hasActiveSession=true, biometricEnabled=false before enabling", async () => {
      const res = await request(app).get(`/api/auth/biometric/status?deviceId=${deviceId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.hasActiveSession).toBe(true);
      expect(res.body.biometricEnabled).toBe(false);
    });

    it("returns hasActiveSession=false for unknown deviceId", async () => {
      const res = await request(app).get("/api/auth/biometric/status?deviceId=no-such-device");
      expect(res.status).toBe(200);
      expect(res.body.hasActiveSession).toBe(false);
      expect(res.body.biometricEnabled).toBe(false);
    });

    it("returns 400 when deviceId param is missing", async () => {
      const res = await request(app).get("/api/auth/biometric/status");
      expect(res.status).toBe(400);
    });

    it("does not require Authorization header", async () => {
      // No Bearer token sent
      const res = await request(app).get(`/api/auth/biometric/status?deviceId=${deviceId}`);
      expect(res.status).toBe(200);
    });
  });

  describe("POST /api/auth/biometric/enable", () => {
    it("enables biometric and returns a biometricToken", async () => {
      const res = await request(app)
        .post("/api/auth/biometric/enable")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ deviceId });

      expect(res.status).toBe(200);
      expect(res.body.biometricToken).toBeTruthy();
      expect(res.body.expiresAt).toBeTruthy();

      biometricToken = res.body.biometricToken;
    });

    it("status now reports biometricEnabled=true", async () => {
      const res = await request(app).get(`/api/auth/biometric/status?deviceId=${deviceId}`);
      expect(res.body.biometricEnabled).toBe(true);
    });

    it("requires authentication", async () => {
      const res = await request(app).post("/api/auth/biometric/enable").send({ deviceId });
      expect(res.status).toBe(401);
    });

    it("returns 401 or 404 for a deviceId with no active session", async () => {
      const res = await request(app)
        .post("/api/auth/biometric/enable")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ deviceId: "no-session-device" });
      // protect validates the session when deviceId is in req.body;
      // a foreign deviceId gets rejected with 401 before the controller runs.
      expect([401, 404]).toContain(res.status);
    });
  });

  describe("POST /api/auth/biometric/register — alias for /enable", () => {
    it("returns biometricToken for a new device session", async () => {
      const devId2 = `bio_reg_${suf()}`;
      const { accessToken: tok2 } = await registerAndLogin({ deviceId: devId2 });

      const res = await request(app)
        .post("/api/auth/biometric/register")
        .set("Authorization", `Bearer ${tok2}`)
        .send({ deviceId: devId2 });

      expect(res.status).toBe(200);
      expect(res.body.biometricToken).toBeTruthy();
    });
  });

  describe("POST /api/auth/biometric/verify", () => {
    it("verifies biometric token and returns new rotated tokens", async () => {
      const res = await request(app)
        .post("/api/auth/biometric/verify")
        .send({ deviceId, biometricToken });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.refreshToken).toBeTruthy();
      // Token must rotate on every successful verify
      expect(res.body.biometricToken).toBeTruthy();
      expect(res.body.biometricToken).not.toBe(biometricToken);

      biometricToken = res.body.biometricToken; // keep for next tests
    });

    it("rejects an invalid biometricToken", async () => {
      const res = await request(app)
        .post("/api/auth/biometric/verify")
        .send({ deviceId, biometricToken: "bad-token-xyz" });
      expect(res.status).toBe(401);
    });

    it("rejects when deviceId is missing", async () => {
      const res = await request(app)
        .post("/api/auth/biometric/verify")
        .send({ biometricToken });
      expect([400, 422]).toContain(res.status);
    });

    it("rejects when biometricToken is missing", async () => {
      const res = await request(app)
        .post("/api/auth/biometric/verify")
        .send({ deviceId });
      expect([400, 422]).toContain(res.status);
    });
  });

  describe("POST /api/auth/biometric/disable", () => {
    it("disables biometric for the device", async () => {
      // Verify once more to get a fresh access token (token from beforeAll may be stale
      // if the verify tests rotated the refresh token)
      const verifyRes = await request(app)
        .post("/api/auth/biometric/verify")
        .send({ deviceId, biometricToken });
      const freshToken = verifyRes.body.accessToken || accessToken;

      const res = await request(app)
        .post("/api/auth/biometric/disable")
        .set("Authorization", `Bearer ${freshToken}`)
        .send({ deviceId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("status reports biometricEnabled=false after disable", async () => {
      const res = await request(app).get(`/api/auth/biometric/status?deviceId=${deviceId}`);
      expect(res.body.biometricEnabled).toBe(false);
    });
  });
});

// =============================================================================
// 6. Nafath
// =============================================================================

describe("Nafath", () => {
  let transactionId;

  describe("POST /api/auth/nafath/initiate", () => {
    it("returns transactionId, randomNumber, and mock flag in dev mode", async () => {
      const res = await request(app)
        .post("/api/auth/nafath/initiate")
        .send({ nationalId: "1234567890" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.transactionId).toBeTruthy();
      expect(res.body.randomNumber).toBeTruthy();
      expect(res.body.expiresIn).toBe(300);
      expect(res.body.pollInterval).toBe(3);
      expect(res.body.mock).toBe(true);

      transactionId = res.body.transactionId;
    });

    it("rejects nationalId shorter than 10 digits", async () => {
      const res = await request(app).post("/api/auth/nafath/initiate").send({ nationalId: "12345" });
      expect([400, 422]).toContain(res.status);
    });

    it("rejects missing nationalId", async () => {
      const res = await request(app).post("/api/auth/nafath/initiate").send({});
      expect([400, 422]).toContain(res.status);
    });
  });

  describe("GET /api/auth/nafath/status/:transactionId", () => {
    it("returns pending or approved status for a valid transactionId", async () => {
      const res = await request(app).get(`/api/auth/nafath/status/${transactionId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(["pending", "approved"]).toContain(res.body.status);
    });

    it("returns 404 for unknown transactionId", async () => {
      const res = await request(app).get("/api/auth/nafath/status/nonexistent-txn-xyz");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/auth/nafath/status/session/:sessionId — alias route", () => {
    it("accepts :sessionId param and resolves the same transaction", async () => {
      const initRes = await request(app)
        .post("/api/auth/nafath/initiate")
        .send({ nationalId: "9876543210" });
      const txId = initRes.body.transactionId;

      const res = await request(app).get(`/api/auth/nafath/status/session/${txId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(["pending", "approved"]).toContain(res.body.status);
    });
  });
});

// =============================================================================
// 7. PIN
// =============================================================================

describe("PIN", () => {
  let accessToken, deviceId;

  beforeAll(async () => {
    deviceId = `pin_${suf()}`;
    ({ accessToken } = await registerAndLogin({ deviceId }));
  });

  describe("POST /api/auth/pin/set", () => {
    it("sets a PIN for the device", async () => {
      const res = await request(app)
        .post("/api/auth/pin/set")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ deviceId, pin: "1234" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("requires authentication", async () => {
      const res = await request(app)
        .post("/api/auth/pin/set")
        .send({ deviceId, pin: "1234" });
      expect(res.status).toBe(401);
    });

    it("rejects PIN shorter than 4 digits", async () => {
      const res = await request(app)
        .post("/api/auth/pin/set")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ deviceId, pin: "12" });
      expect([400, 422]).toContain(res.status);
    });
  });

  describe("POST /api/auth/pin/verify", () => {
    it("verifies correct PIN and returns tokens", async () => {
      const res = await request(app)
        .post("/api/auth/pin/verify")
        .send({ deviceId, pin: "1234" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.accessToken).toBeTruthy();
    });

    it("rejects wrong PIN with 401", async () => {
      const res = await request(app)
        .post("/api/auth/pin/verify")
        .send({ deviceId, pin: "9999" });
      expect(res.status).toBe(401);
    });

    it("rejects missing pin field", async () => {
      const res = await request(app)
        .post("/api/auth/pin/verify")
        .send({ deviceId });
      expect([400, 422]).toContain(res.status);
    });
  });

  describe("DELETE /api/auth/pin", () => {
    it("removes the PIN for the device", async () => {
      const res = await request(app)
        .delete("/api/auth/pin")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ deviceId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("PIN verify returns error after removal", async () => {
      const res = await request(app)
        .post("/api/auth/pin/verify")
        .send({ deviceId, pin: "1234" });
      // 404 = PIN not set for this device
      expect([401, 404]).toContain(res.status);
    });
  });
});
