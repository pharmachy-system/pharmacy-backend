require("./setup");

const request = require("supertest");
const app = require("../src/app");
const User = require("../src/models/User.model");

const uniqueSuffix = () => Date.now() + Math.floor(Math.random() * 10000);

describe("Users API", () => {
  let customerToken;
  let adminToken;
  let addedAddressId;
  const suffix = uniqueSuffix();

  const testAddress = {
    label: "home",
    fullName: "Test User",
    phone: "0501234567",
    street: "123 Test Street",
    city: "Riyadh",
    region: "Riyadh Region",
    country: "SA",
    isDefault: false,
  };

  beforeAll(async () => {
    const custRes = await request(app).post("/api/auth/register").send({
      name: "Profile Customer",
      email: `profile_customer_${suffix}@pharmacy-test.com`,
      password: "Password123!",
    });
    customerToken = custRes.body.accessToken;

    const adminRes = await request(app).post("/api/auth/register").send({
      name: "Profile Admin",
      email: `profile_admin_${suffix}@pharmacy-test.com`,
      password: "Password123!",
      role: "admin",
      adminSecret: process.env.ADMIN_REGISTRATION_SECRET,
    });
    adminToken = adminRes.body.accessToken;
  });

  afterAll(async () => {
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
  });

  // ─── Get My Profile ─────────────────────────────────────────────────────────

  describe("GET /api/users/me", () => {
    it("returns own profile with wallet balance", async () => {
      const res = await request(app)
        .get("/api/users/me")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.password).toBeUndefined();
      expect(res.body.walletBalance).toBeDefined();
      expect(typeof res.body.walletBalance).toBe("number");
    });

    it("requires authentication", async () => {
      const res = await request(app).get("/api/users/me");
      expect(res.status).toBe(401);
    });
  });

  // ─── Update Profile ─────────────────────────────────────────────────────────

  describe("PUT /api/users/me", () => {
    it("updates name", async () => {
      const res = await request(app)
        .put("/api/users/me")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ name: "Updated Profile Name" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.name).toBe("Updated Profile Name");
    });

    it("updates phone", async () => {
      const res = await request(app)
        .put("/api/users/me")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ phone: "0509876543" });

      expect(res.status).toBe(200);
      expect(res.body.user.phone).toBe("0509876543");
    });

    it("requires authentication", async () => {
      const res = await request(app)
        .put("/api/users/me")
        .send({ name: "Anon" });
      expect(res.status).toBe(401);
    });
  });

  // ─── Loyalty Points ─────────────────────────────────────────────────────────

  describe("GET /api/users/me/loyalty", () => {
    it("returns loyalty balance and transaction history", async () => {
      const res = await request(app)
        .get("/api/users/me/loyalty")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.balance).toBeDefined();
      expect(typeof res.body.balance).toBe("number");
      expect(Array.isArray(res.body.transactions)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it("requires authentication", async () => {
      const res = await request(app).get("/api/users/me/loyalty");
      expect(res.status).toBe(401);
    });
  });

  // ─── Addresses ──────────────────────────────────────────────────────────────

  describe("GET /api/users/me/addresses", () => {
    it("returns empty address list for new user", async () => {
      const res = await request(app)
        .get("/api/users/me/addresses")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.addresses)).toBe(true);
    });

    it("requires authentication", async () => {
      const res = await request(app).get("/api/users/me/addresses");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/users/me/addresses", () => {
    it("adds a new address", async () => {
      const res = await request(app)
        .post("/api/users/me/addresses")
        .set("Authorization", `Bearer ${customerToken}`)
        .send(testAddress);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.addresses).toHaveLength(1);
      expect(res.body.addresses[0].city).toBe("Riyadh");
      // First address is always set as default
      expect(res.body.addresses[0].isDefault).toBe(true);

      addedAddressId = res.body.addresses[0]._id;
    });

    it("adds a second address", async () => {
      const res = await request(app)
        .post("/api/users/me/addresses")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ ...testAddress, city: "Jeddah", label: "work" });

      expect(res.status).toBe(201);
      expect(res.body.addresses).toHaveLength(2);
    });

    it("requires authentication", async () => {
      const res = await request(app)
        .post("/api/users/me/addresses")
        .send(testAddress);
      expect(res.status).toBe(401);
    });
  });

  describe("PUT /api/users/me/addresses/:addressId", () => {
    it("updates an address", async () => {
      const res = await request(app)
        .put(`/api/users/me/addresses/${addedAddressId}`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ city: "Dammam" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const updated = res.body.addresses.find((a) => a._id === addedAddressId);
      expect(updated.city).toBe("Dammam");
    });

    it("returns 404 for non-existent address", async () => {
      const res = await request(app)
        .put("/api/users/me/addresses/000000000000000000000000")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ city: "Nowhere" });

      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/users/me/addresses/:addressId/default", () => {
    it("sets an address as default", async () => {
      // Get the second address id (Jeddah/work)
      const listRes = await request(app)
        .get("/api/users/me/addresses")
        .set("Authorization", `Bearer ${customerToken}`);
      const secondAddress = listRes.body.addresses.find((a) => a._id !== addedAddressId);

      const res = await request(app)
        .patch(`/api/users/me/addresses/${secondAddress._id}/default`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const nowDefault = res.body.addresses.find((a) => a._id === secondAddress._id);
      expect(nowDefault.isDefault).toBe(true);
      const notDefault = res.body.addresses.find((a) => a._id === addedAddressId);
      expect(notDefault.isDefault).toBe(false);
    });
  });

  describe("DELETE /api/users/me/addresses/:addressId", () => {
    it("deletes an address", async () => {
      const res = await request(app)
        .delete(`/api/users/me/addresses/${addedAddressId}`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const deleted = res.body.addresses.find((a) => a._id === addedAddressId);
      expect(deleted).toBeUndefined();
    });

    it("returns 404 for non-existent address", async () => {
      const res = await request(app)
        .delete("/api/users/me/addresses/000000000000000000000000")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ─── Admin: List Users ──────────────────────────────────────────────────────

  describe("GET /api/users (admin)", () => {
    it("admin can list all users", async () => {
      const res = await request(app)
        .get("/api/users")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it("admin can filter by role", async () => {
      const res = await request(app)
        .get("/api/users?role=customer")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      res.body.users.forEach((u) => expect(u.role).toBe("customer"));
    });

    it("admin can search by name", async () => {
      const res = await request(app)
        .get("/api/users?search=Profile Admin")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.users.length).toBeGreaterThanOrEqual(1);
    });

    it("customer cannot list users", async () => {
      const res = await request(app)
        .get("/api/users")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });
  });
});
