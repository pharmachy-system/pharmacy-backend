require("./setup");

const request = require("supertest");
const app     = require("../src/app");
const User    = require("../src/models/User.model");
const Session = require("../src/models/Session.model");
const mongoose = require("mongoose");

const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;

describe("Device Management API (/api/user/devices)", () => {
  let token, deviceId;

  beforeAll(async () => {
    const s = suf();
    deviceId = `devtest_${s}`;

    const res = await request(app).post("/api/auth/register").send({
      name: "Dev User", email: `dev_user_${s}@pharmacy-test.com`,
      password: "Password123!", deviceId,
    });
    token = res.body.accessToken;
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
    await Session.deleteMany({ deviceId: /^devtest_/ });
  });

  describe("GET /api/user/devices — list devices", () => {
    it("returns the current active session", async () => {
      const res = await request(app)
        .get("/api/user/devices")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBeGreaterThan(0);
      expect(Array.isArray(res.body.devices)).toBe(true);
      const dev = res.body.devices.find((d) => d.deviceId === deviceId);
      expect(dev).toBeDefined();
    });

    it("requires authentication", async () => {
      const res = await request(app).get("/api/user/devices");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/user/devices/current — current device", () => {
    it("returns current session via x-device-id header", async () => {
      const res = await request(app)
        .get("/api/user/devices/current")
        .set("Authorization", `Bearer ${token}`)
        .set("x-device-id", deviceId);

      expect(res.status).toBe(200);
      expect(res.body.device.deviceId).toBe(deviceId);
    });

    it("returns 400 when deviceId missing", async () => {
      const res = await request(app)
        .get("/api/user/devices/current")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(400);
    });

    it("returns 401 or 404 for unknown deviceId", async () => {
      const res = await request(app)
        .get("/api/user/devices/current")
        .set("Authorization", `Bearer ${token}`)
        .set("x-device-id", "totally-unknown-device-xyz");
      // protect middleware returns 401 when no session found for this deviceId/user pair
      expect([401, 404]).toContain(res.status);
    });
  });

  describe("PUT /api/user/devices/:deviceId — update preferences", () => {
    it("updates device language and timezone", async () => {
      const res = await request(app)
        .put(`/api/user/devices/${deviceId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ language: "ar", timezone: "Asia/Riyadh" });

      expect(res.status).toBe(200);
      expect(res.body.device.language).toBe("ar");
      expect(res.body.device.timezone).toBe("Asia/Riyadh");
    });

    it("updates fcmToken", async () => {
      const res = await request(app)
        .put(`/api/user/devices/${deviceId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ fcmToken: "test-fcm-token-abc123" });
      expect(res.status).toBe(200);
    });

    it("returns 400 when no updatable fields are provided", async () => {
      const res = await request(app)
        .put(`/api/user/devices/${deviceId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it("returns 404 for unknown deviceId", async () => {
      const res = await request(app)
        .put(`/api/user/devices/no-such-device-xyz`)
        .set("Authorization", `Bearer ${token}`)
        .send({ language: "en" });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/user/devices/:deviceId — revoke specific device", () => {
    let extraDeviceId, extraToken;

    beforeAll(async () => {
      extraDeviceId = `devtest_extra_${suf()}`;
      // Register a new user session with a second device
      const r = await request(app)
        .post("/api/auth/login")
        .send({
          email: (await User.findOne({ email: /dev_user_/ }).select("email")).email,
          password: "Password123!",
          deviceId: extraDeviceId,
        });
      extraToken = r.body.accessToken;
    });

    it("revokes a specific device session", async () => {
      const res = await request(app)
        .delete(`/api/user/devices/${extraDeviceId}`)
        .set("Authorization", `Bearer ${token}`)
        .set("x-device-id", deviceId); // current device must match for protect

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const session = await Session.findOne({ deviceId: extraDeviceId });
      expect(session.isActive).toBe(false);
    });

    it("returns 404 for already-revoked device", async () => {
      const res = await request(app)
        .delete(`/api/user/devices/${extraDeviceId}`)
        .set("Authorization", `Bearer ${token}`)
        .set("x-device-id", deviceId);
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/user/devices — revoke ALL sessions", () => {
    it("revokes all active sessions and returns count", async () => {
      const res = await request(app)
        .delete("/api/user/devices")
        .set("Authorization", `Bearer ${token}`)
        .set("x-device-id", deviceId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.revokedCount).toBe("number");
    });
  });
});
