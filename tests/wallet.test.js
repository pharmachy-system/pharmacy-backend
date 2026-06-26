require("./setup");

const request = require("supertest");
const app = require("../src/app");
const User = require("../src/models/User.model");
const Wallet = require("../src/models/Wallet.model");

const uniqueSuffix = () => Date.now() + Math.floor(Math.random() * 10000);

describe("Wallet API", () => {
  let customerToken;
  let customerId;
  let adminToken;
  const suffix = uniqueSuffix();

  beforeAll(async () => {
    const custRes = await request(app).post("/api/auth/register").send({
      name: "Wallet Customer",
      email: `wallet_customer_${suffix}@pharmacy-test.com`,
      password: "Password123!",
    });
    customerToken = custRes.body.accessToken;
    customerId = custRes.body.user.id;

    const adminRes = await request(app).post("/api/auth/register").send({
      name: "Wallet Admin",
      email: `wallet_admin_${suffix}@pharmacy-test.com`,
      password: "Password123!",
      role: "admin",
      adminSecret: process.env.ADMIN_REGISTRATION_SECRET,
    });
    adminToken = adminRes.body.accessToken;
  });

  afterAll(async () => {
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
    await Wallet.deleteMany({ user: customerId });
  });

  // ─── Get Wallet Balance ─────────────────────────────────────────────────────

  describe("GET /api/wallet", () => {
    it("returns wallet balance (creates wallet if needed)", async () => {
      const res = await request(app)
        .get("/api/wallet")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.balance).toBe("number");
      expect(res.body.balance).toBe(0); // new wallet starts at 0
      expect(res.body.isActive).toBe(true);
    });

    it("requires authentication", async () => {
      const res = await request(app).get("/api/wallet");
      expect(res.status).toBe(401);
    });
  });

  // ─── Transaction History ────────────────────────────────────────────────────

  describe("GET /api/wallet/transactions", () => {
    it("returns empty transaction list for new wallet", async () => {
      const res = await request(app)
        .get("/api/wallet/transactions")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.transactions)).toBe(true);
      expect(res.body.balance).toBe(0);
      expect(res.body.pagination).toBeDefined();
    });

    it("paginates transactions", async () => {
      const res = await request(app)
        .get("/api/wallet/transactions?page=1&limit=5")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.transactions.length).toBeLessThanOrEqual(5);
    });

    it("requires authentication", async () => {
      const res = await request(app).get("/api/wallet/transactions");
      expect(res.status).toBe(401);
    });
  });

  // ─── Admin Credit Wallet ────────────────────────────────────────────────────

  describe("POST /api/wallet/credit", () => {
    it("admin can credit a user wallet", async () => {
      const res = await request(app)
        .post("/api/wallet/credit")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          userId: customerId,
          amount: 100,
          description: "Test credit from admin",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.balance).toBe(100);
    });

    it("balance reflects credit in subsequent GET", async () => {
      const res = await request(app)
        .get("/api/wallet")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.balance).toBe(100);
    });

    it("credit appears in transaction history", async () => {
      const res = await request(app)
        .get("/api/wallet/transactions")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.transactions.length).toBeGreaterThanOrEqual(1);
      const credit = res.body.transactions.find((t) => t.type === "credit");
      expect(credit).toBeDefined();
      expect(credit.amount).toBe(100);
    });

    it("admin can credit own wallet without userId", async () => {
      const res = await request(app)
        .post("/api/wallet/credit")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ amount: 50, description: "Self credit" });

      expect(res.status).toBe(200);
      expect(res.body.balance).toBe(50);
    });

    it("rejects zero amount", async () => {
      const res = await request(app)
        .post("/api/wallet/credit")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ userId: customerId, amount: 0 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("rejects negative amount", async () => {
      const res = await request(app)
        .post("/api/wallet/credit")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ userId: customerId, amount: -50 });

      expect(res.status).toBe(400);
    });

    it("customer cannot credit wallet", async () => {
      const res = await request(app)
        .post("/api/wallet/credit")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ amount: 100 });

      expect(res.status).toBe(403);
    });

    it("requires authentication", async () => {
      const res = await request(app)
        .post("/api/wallet/credit")
        .send({ amount: 100 });

      expect(res.status).toBe(401);
    });
  });
});
