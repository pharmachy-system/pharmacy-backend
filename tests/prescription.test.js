require("./setup");

const request      = require("supertest");
const app          = require("../src/app");
const User         = require("../src/models/User.model");
const Prescription = require("../src/models/Prescription.model");
const mongoose     = require("mongoose");

const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;
const ADMIN_SECRET = process.env.ADMIN_REGISTRATION_SECRET;

describe("Prescriptions API", () => {
  let pharmacistToken, customer1Token, customer2Token, customer1Id;
  let prescriptionId;

  beforeAll(async () => {
    const s = suf();

    const pharmaRes = await request(app).post("/api/auth/register").send({
      name: "Rx Pharmacist", email: `rx_pharma_${s}@pharmacy-test.com`,
      password: "Password123!", role: "pharmacist", adminSecret: ADMIN_SECRET,
    });
    pharmacistToken = pharmaRes.body.accessToken;

    const c1Res = await request(app).post("/api/auth/register").send({
      name: "Rx Cust1", email: `rx_c1_${s}@pharmacy-test.com`,
      password: "Password123!",
    });
    customer1Token = c1Res.body.accessToken;
    customer1Id    = c1Res.body.user.id;

    const c2Res = await request(app).post("/api/auth/register").send({
      name: "Rx Cust2", email: `rx_c2_${s}@pharmacy-test.com`,
      password: "Password123!",
    });
    customer2Token = c2Res.body.accessToken;
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await User.deleteMany({ email: /pharmacy-test\.com$/ });
    await Prescription.deleteMany({ doctor: /TestDoc/ });
  });

  // ─── Create prescription ───────────────────────────────────────────────────

  describe("POST /api/prescriptions — upload prescription", () => {
    it("customer can submit a prescription (no image)", async () => {
      const res = await request(app)
        .post("/api/prescriptions")
        .set("Authorization", `Bearer ${customer1Token}`)
        .send({ doctor: "TestDoc Smith", hospitalClinic: "City Hospital" });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.prescription.status).toBe("pending");
      expect(res.body.prescription.doctor).toBe("TestDoc Smith");
      prescriptionId = res.body.prescription._id;
    });

    it("prescription includes optional medicines list", async () => {
      const res = await request(app)
        .post("/api/prescriptions")
        .set("Authorization", `Bearer ${customer1Token}`)
        .field("doctor", "TestDoc Jones")
        .field(
          "medicines",
          JSON.stringify([{ name: "Paracetamol", dosage: "500mg", frequency: "3x daily" }])
        );

      expect(res.status).toBe(201);
      expect(res.body.prescription.medicines).toHaveLength(1);
    });

    it("requires authentication", async () => {
      const res = await request(app)
        .post("/api/prescriptions")
        .send({ doctor: "TestDoc NoAuth" });
      expect(res.status).toBe(401);
    });
  });

  // ─── Customer: get own prescriptions ──────────────────────────────────────

  describe("GET /api/prescriptions/my-prescriptions", () => {
    it("customer gets their own prescriptions only", async () => {
      const res = await request(app)
        .get("/api/prescriptions/my-prescriptions")
        .set("Authorization", `Bearer ${customer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.prescriptions)).toBe(true);
      expect(res.body.prescriptions.length).toBeGreaterThan(0);
    });

    it("second customer sees only their own (empty)", async () => {
      const res = await request(app)
        .get("/api/prescriptions/my-prescriptions")
        .set("Authorization", `Bearer ${customer2Token}`);
      expect(res.status).toBe(200);
      expect(res.body.prescriptions.length).toBe(0);
    });

    it("supports status filter", async () => {
      const res = await request(app)
        .get("/api/prescriptions/my-prescriptions?status=pending")
        .set("Authorization", `Bearer ${customer1Token}`);
      expect(res.status).toBe(200);
      res.body.prescriptions.forEach((p) => expect(p.status).toBe("pending"));
    });
  });

  // ─── Pharmacist: get all prescriptions ────────────────────────────────────

  describe("GET /api/prescriptions — pharmacist / admin", () => {
    it("pharmacist can list all prescriptions", async () => {
      const res = await request(app)
        .get("/api/prescriptions")
        .set("Authorization", `Bearer ${pharmacistToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.prescriptions)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it("customer cannot list all prescriptions (403)", async () => {
      const res = await request(app)
        .get("/api/prescriptions")
        .set("Authorization", `Bearer ${customer1Token}`);
      expect(res.status).toBe(403);
    });
  });

  // ─── Get by ID ─────────────────────────────────────────────────────────────

  describe("GET /api/prescriptions/:id", () => {
    it("owner can get their prescription by id", async () => {
      const res = await request(app)
        .get(`/api/prescriptions/${prescriptionId}`)
        .set("Authorization", `Bearer ${customer1Token}`);
      expect(res.status).toBe(200);
      expect(res.body.prescription._id).toBe(prescriptionId);
    });

    it("another customer cannot access someone else's prescription (403)", async () => {
      const res = await request(app)
        .get(`/api/prescriptions/${prescriptionId}`)
        .set("Authorization", `Bearer ${customer2Token}`);
      expect(res.status).toBe(403);
    });

    it("pharmacist can access any prescription", async () => {
      const res = await request(app)
        .get(`/api/prescriptions/${prescriptionId}`)
        .set("Authorization", `Bearer ${pharmacistToken}`);
      expect(res.status).toBe(200);
    });

    it("returns 404 for unknown id", async () => {
      const res = await request(app)
        .get(`/api/prescriptions/${new mongoose.Types.ObjectId()}`)
        .set("Authorization", `Bearer ${pharmacistToken}`);
      expect(res.status).toBe(404);
    });
  });

  // ─── Status update ─────────────────────────────────────────────────────────

  describe("PUT /api/prescriptions/:id/status — pharmacist review", () => {
    it("pharmacist can approve a prescription", async () => {
      const res = await request(app)
        .put(`/api/prescriptions/${prescriptionId}/status`)
        .set("Authorization", `Bearer ${pharmacistToken}`)
        .send({ status: "approved", notes: "Valid prescription" });

      expect(res.status).toBe(200);
      expect(res.body.prescription.status).toBe("approved");
    });

    it("pharmacist can reject with reason", async () => {
      // Create a fresh prescription to reject
      const newPrx = await request(app)
        .post("/api/prescriptions")
        .set("Authorization", `Bearer ${customer2Token}`)
        .send({ doctor: "TestDoc Reject" });
      const pid = newPrx.body.prescription._id;

      const res = await request(app)
        .put(`/api/prescriptions/${pid}/status`)
        .set("Authorization", `Bearer ${pharmacistToken}`)
        .send({ status: "rejected", rejectionReason: "Illegible handwriting" });

      expect(res.status).toBe(200);
      expect(res.body.prescription.status).toBe("rejected");
    });

    it("customer cannot update prescription status (403)", async () => {
      const res = await request(app)
        .put(`/api/prescriptions/${prescriptionId}/status`)
        .set("Authorization", `Bearer ${customer1Token}`)
        .send({ status: "under_review" });
      expect(res.status).toBe(403);
    });
  });
});
