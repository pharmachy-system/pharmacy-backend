require("./setup");

const request      = require("supertest");
const app          = require("../src/app");
const User         = require("../src/models/User.model");
const Notification = require("../src/models/Notification.model");
const mongoose     = require("mongoose");

const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;
const ADMIN_SECRET = process.env.ADMIN_REGISTRATION_SECRET;

describe("Notifications API", () => {
  let adminToken, customerToken, userId;
  let notifId;

  beforeAll(async () => {
    const s = suf();

    const adminRes = await request(app).post("/api/auth/register").send({
      name: "Notif Admin", email: `notif_admin_${s}@pharmacy-test.com`,
      password: "Password123!", role: "admin", adminSecret: ADMIN_SECRET,
    });
    adminToken = adminRes.body.accessToken;

    const custRes = await request(app).post("/api/auth/register").send({
      name: "Notif Customer", email: `notif_cust_${s}@pharmacy-test.com`,
      password: "Password123!",
    });
    customerToken = custRes.body.accessToken;
    userId = custRes.body.user.id;
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
    await Notification.deleteMany({ title: /^TestNotif/ });
  });

  // ─── Seed some notifications directly via model ───────────────────────────

  const seedNotif = async (userId, overrides = {}) => {
    return Notification.create({
      user: userId,
      type: "system",
      title: `TestNotif_${suf()}`,
      body: "Test notification body",
      ...overrides,
    });
  };

  describe("GET /api/notifications", () => {
    it("returns empty list for new user", async () => {
      const res = await request(app)
        .get("/api/notifications")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.notifications)).toBe(true);
      expect(res.body.unreadCount).toBeDefined();
    });

    it("returns unread count and pagination", async () => {
      const user = await User.findById(userId);
      await seedNotif(user._id, { isRead: false });
      await seedNotif(user._id, { isRead: false });

      const res = await request(app)
        .get("/api/notifications")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.body.unreadCount).toBeGreaterThanOrEqual(2);
      expect(res.body.pagination).toBeDefined();
    });

    it("filters by unread=true", async () => {
      const res = await request(app)
        .get("/api/notifications?unread=true")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(200);
      res.body.notifications.forEach((n) => expect(n.isRead).toBe(false));
    });

    it("requires authentication", async () => {
      const res = await request(app).get("/api/notifications");
      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /api/notifications/:id/read", () => {
    beforeAll(async () => {
      const user = await User.findById(userId);
      const n = await seedNotif(user._id, { isRead: false });
      notifId = n._id.toString();
    });

    it("marks a single notification as read", async () => {
      const res = await request(app)
        .patch(`/api/notifications/${notifId}/read`)
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const n = await Notification.findById(notifId);
      expect(n.isRead).toBe(true);
    });
  });

  describe("PATCH /api/notifications/read-all", () => {
    it("marks all notifications as read", async () => {
      const user = await User.findById(userId);
      await seedNotif(user._id, { isRead: false });
      await seedNotif(user._id, { isRead: false });

      const res = await request(app)
        .patch("/api/notifications/read-all")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(200);

      const unreadCount = await Notification.countDocuments({
        user: user._id, isRead: false,
      });
      expect(unreadCount).toBe(0);
    });
  });

  describe("DELETE /api/notifications/:id", () => {
    it("deletes a specific notification", async () => {
      const user = await User.findById(userId);
      const n = await seedNotif(user._id);

      const res = await request(app)
        .delete(`/api/notifications/${n._id}`)
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(200);

      const found = await Notification.findById(n._id);
      expect(found).toBeNull();
    });

    it("returns 404 for unknown notification", async () => {
      const res = await request(app)
        .delete(`/api/notifications/${new mongoose.Types.ObjectId()}`)
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/notifications — clear all", () => {
    it("clears all notifications for the user", async () => {
      const user = await User.findById(userId);
      await seedNotif(user._id);

      const res = await request(app)
        .delete("/api/notifications")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(200);

      const count = await Notification.countDocuments({ user: user._id });
      expect(count).toBe(0);
    });
  });

  describe("POST /api/notifications/send — admin broadcast", () => {
    it("admin can send notification to specific users", async () => {
      const res = await request(app)
        .post("/api/notifications/send")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          userIds: [userId],
          type: "promotion",
          title: "TestNotif_broadcast",
          body: "Admin test broadcast",
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("customer cannot send notifications (403)", async () => {
      const res = await request(app)
        .post("/api/notifications/send")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ type: "system", title: "TestNotif_blocked", body: "Blocked" });
      expect(res.status).toBe(403);
    });
  });
});
