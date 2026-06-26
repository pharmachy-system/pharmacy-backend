require("./setup");

const request  = require("supertest");
const app      = require("../src/app");
const User     = require("../src/models/User.model");
const mongoose = require("mongoose");

const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;
const ADMIN_SECRET = process.env.ADMIN_REGISTRATION_SECRET;

describe("Referral API", () => {
  let adminToken, referrerToken, refereeToken;
  let referrerCode;

  beforeAll(async () => {
    const s = suf();

    const adminRes = await request(app).post("/api/auth/register").send({
      name: "Ref Admin", email: `ref_admin_${s}@pharmacy-test.com`,
      password: "Password123!", role: "admin", adminSecret: ADMIN_SECRET,
    });
    adminToken = adminRes.body.accessToken;

    const refRes = await request(app).post("/api/auth/register").send({
      name: "Referrer User", email: `ref_referrer_${s}@pharmacy-test.com`,
      password: "Password123!",
    });
    referrerToken = refRes.body.accessToken;

    const reeRes = await request(app).post("/api/auth/register").send({
      name: "Referee User", email: `ref_referee_${s}@pharmacy-test.com`,
      password: "Password123!",
    });
    refereeToken = reeRes.body.accessToken;
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
  });

  // ─── GET /api/referrals/me ─────────────────────────────────────────────────

  describe("GET /api/referrals/me", () => {
    it("returns referral code, shareLink, and stats for authenticated user", async () => {
      const res = await request(app)
        .get("/api/referrals/me")
        .set("Authorization", `Bearer ${referrerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.referralCode).toBeTruthy();
      expect(res.body.shareLink).toContain(res.body.referralCode);
      expect(res.body.stats).toBeDefined();
      expect(res.body.stats.referredCount).toBe(0);
      expect(res.body.stats.pointsEarned).toBe(0);
      expect(res.body.rewards.youEarnPerReferral).toBeGreaterThan(0);

      referrerCode = res.body.referralCode;
    });

    it("requires authentication", async () => {
      const res = await request(app).get("/api/referrals/me");
      expect(res.status).toBe(401);
    });
  });

  // ─── GET /api/referrals/validate/:code ────────────────────────────────────

  describe("GET /api/referrals/validate/:code", () => {
    it("returns valid=true and referrer name for a valid code", async () => {
      const res = await request(app)
        .get(`/api/referrals/validate/${referrerCode}`)
        .set("Authorization", `Bearer ${refereeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.referrer.name).toBe("Referrer User");
      expect(res.body.bonus).toBeDefined();
    });

    it("returns 404 for an invalid code", async () => {
      const res = await request(app)
        .get("/api/referrals/validate/INVALID999")
        .set("Authorization", `Bearer ${refereeToken}`);
      expect(res.status).toBe(404);
    });

    it("works without authentication (public route)", async () => {
      const res = await request(app).get(`/api/referrals/validate/${referrerCode}`);
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
    });
  });

  // ─── GET /api/referrals/me/referred-users ─────────────────────────────────

  describe("GET /api/referrals/me/referred-users", () => {
    it("returns empty list when nobody used the referral code yet", async () => {
      const res = await request(app)
        .get("/api/referrals/me/referred-users")
        .set("Authorization", `Bearer ${referrerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.users).toHaveLength(0);
      expect(res.body.pagination.total).toBe(0);
    });

    it("reflects users who registered with the referral code", async () => {
      // Register a user using the referral code
      const referrerUser = await User.findOne({ email: /ref_referrer_/ });
      await request(app).post("/api/auth/register").send({
        name: "Via Referral", email: `ref_via_${suf()}@pharmacy-test.com`,
        password: "Password123!", referralCode: referrerCode,
      });

      const res = await request(app)
        .get("/api/referrals/me/referred-users")
        .set("Authorization", `Bearer ${referrerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBeGreaterThan(0);
      expect(res.body.users[0].hasOrdered).toBe(false); // no order yet
    });
  });

  // ─── GET /api/referrals/admin/stats ───────────────────────────────────────

  describe("GET /api/referrals/admin/stats", () => {
    it("admin gets system-wide referral statistics", async () => {
      const res = await request(app)
        .get("/api/referrals/admin/stats")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.stats.totalReferrals).toBeGreaterThanOrEqual(0);
      expect(res.body.stats.totalRewardsIssued).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(res.body.topReferrers)).toBe(true);
    });

    it("customer gets 403", async () => {
      const res = await request(app)
        .get("/api/referrals/admin/stats")
        .set("Authorization", `Bearer ${referrerToken}`);
      expect(res.status).toBe(403);
    });
  });
});
