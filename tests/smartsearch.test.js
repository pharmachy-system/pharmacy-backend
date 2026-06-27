require("./setup");

const request  = require("supertest");
const app      = require("../src/app");
const Medicine = require("../src/models/Medicine.model");
const Category = require("../src/models/Category.model");
const mongoose = require("mongoose");

const suf = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;

describe("Smart Search API", () => {
  let catId;
  const s = suf();

  beforeAll(async () => {
    const cat = await Category.create({ name: `SSearch_Cat_${s}`, isActive: true });
    catId = cat._id;

    await Medicine.create([
      { name: `Amoxicillin Smart ${s}`, price: 25, stock: 100, category: catId, isActive: true, tags: ["antibiotic", "bacteria"] },
      { name: `Paracetamol Smart ${s}`, price: 10, stock: 50,  category: catId, isActive: true, tags: ["pain", "fever"] },
      { name: `Ibuprofen Smart ${s}`,   price: 15, stock: 80,  category: catId, isActive: true, tags: ["anti-inflammatory", "pain"] },
    ]);
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await Category.deleteMany({ name: /^SSearch_Cat_/ });
    await Medicine.deleteMany({ name: /Smart \d/ });
  });

  it("returns 400 without q param", async () => {
    const res = await request(app).get("/api/medicines/search/smart");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns medicines matching query", async () => {
    const res = await request(app).get(`/api/medicines/search/smart?q=Smart+${s}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.medicines)).toBe(true);
  });

  it("returns facets with categories and brands", async () => {
    const res = await request(app).get(`/api/medicines/search/smart?q=Smart+${s}`);
    expect(res.status).toBe(200);
    expect(res.body.facets).toBeDefined();
    expect(Array.isArray(res.body.facets.categories)).toBe(true);
    expect(Array.isArray(res.body.facets.brands)).toBe(true);
  });

  it("returns pagination metadata", async () => {
    const res = await request(app).get(`/api/medicines/search/smart?q=Smart+${s}`);
    expect(res.status).toBe(200);
    expect(res.body.pagination).toBeDefined();
    expect(typeof res.body.pagination.total).toBe("number");
  });

  it("returns meta.usedFallback field", async () => {
    const res = await request(app).get(`/api/medicines/search/smart?q=Smart+${s}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.meta.usedFallback).toBe("boolean");
  });

  it("is publicly accessible without auth", async () => {
    const res = await request(app).get(`/api/medicines/search/smart?q=Paracetamol`);
    expect(res.status).toBe(200);
  });

  it("respects inStock filter", async () => {
    const res = await request(app).get(`/api/medicines/search/smart?q=Smart+${s}&inStock=true`);
    expect(res.status).toBe(200);
    res.body.medicines.forEach((m) => expect(m.stock).toBeGreaterThan(0));
  });

  it("works at /api/v1 prefix", async () => {
    const res = await request(app).get(`/api/v1/medicines/search/smart?q=Smart+${s}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
