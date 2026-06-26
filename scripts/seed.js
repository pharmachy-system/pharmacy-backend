/**
 * Database seeder — run once to bootstrap initial data.
 *
 * Usage:
 *   node scripts/seed.js
 *   node scripts/seed.js --fresh   # drops existing data first
 */

require("dotenv").config();
const mongoose = require("mongoose");

const User      = require("../src/models/User.model");
const Category  = require("../src/models/Category.model");
const Brand     = require("../src/models/Brand.model");
const Medicine  = require("../src/models/Medicine.model");

const FRESH = process.argv.includes("--fresh");

// ─── Seed data ────────────────────────────────────────────────────────────────

const categories = [
  { name: "Pain Relief",       nameAr: "مسكنات الألم",    slug: "pain-relief",       isFeatured: true },
  { name: "Vitamins & Supplements", nameAr: "الفيتامينات والمكملات", slug: "vitamins-supplements", isFeatured: true },
  { name: "Antibiotics",       nameAr: "مضادات حيوية",    slug: "antibiotics",       isFeatured: false },
  { name: "Heart & Blood Pressure", nameAr: "القلب وضغط الدم", slug: "heart-blood-pressure", isFeatured: false },
  { name: "Diabetes",          nameAr: "السكري",          slug: "diabetes",          isFeatured: false },
  { name: "Cold & Flu",        nameAr: "البرد والإنفلونزا", slug: "cold-flu",         isFeatured: true },
  { name: "Skin Care",         nameAr: "العناية بالبشرة", slug: "skin-care",         isFeatured: false },
  { name: "Eye & Ear",         nameAr: "العين والأذن",    slug: "eye-ear",           isFeatured: false },
];

const brands = [
  { name: "Panadol",    nameAr: "بنادول",    description: "GSK pain relief brand" },
  { name: "Brufen",     nameAr: "بروفين",    description: "Abbott ibuprofen brand" },
  { name: "Vitamin C",  nameAr: "فيتامين C", description: "Various vitamin C brands" },
  { name: "Augmentin",  nameAr: "أوجمنتين",  description: "GSK antibiotic brand" },
  { name: "Nexium",     nameAr: "نيكسيوم",   description: "AstraZeneca acid reflux brand" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) { console.log(`  ${msg}`); }
function ok(msg)  { console.log(`  ✓ ${msg}`); }
function warn(msg){ console.log(`  ⚠ ${msg}`); }

// ─── Runner ───────────────────────────────────────────────────────────────────

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB\n");

  // ── Optional: wipe existing seed data ──────────────────────────────────────
  if (FRESH) {
    await Promise.all([
      Category.deleteMany({}),
      Brand.deleteMany({}),
      Medicine.deleteMany({}),
    ]);
    // Delete seeded admin (identified by ADMIN_REGISTRATION_SECRET comment)
    await User.deleteOne({ email: process.env.SEED_ADMIN_EMAIL || "admin@pharmacy.sa" });
    warn("Existing seed data cleared (--fresh)");
  }

  // ── 1. Admin user ───────────────────────────────────────────────────────────
  const adminEmail    = process.env.SEED_ADMIN_EMAIL    || "admin@pharmacy.sa";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@123456";

  const existingAdmin = await User.findOne({ email: adminEmail });
  if (existingAdmin) {
    warn(`Admin already exists: ${adminEmail}`);
  } else {
    const bcrypt = require("bcryptjs");
    const hash   = await bcrypt.hash(adminPassword, 12);
    await User.create({
      name:            "System Admin",
      email:           adminEmail,
      password:        hash,
      role:            "admin",
      isEmailVerified: true,
      isActive:        true,
    });
    ok(`Admin created: ${adminEmail} / ${adminPassword}`);
  }

  // ── 2. Categories ───────────────────────────────────────────────────────────
  let catMap = {};
  for (const cat of categories) {
    const exists = await Category.findOne({ slug: cat.slug });
    if (exists) {
      catMap[cat.slug] = exists._id;
      warn(`Category exists: ${cat.name}`);
    } else {
      const created = await Category.create({ ...cat, isActive: true });
      catMap[cat.slug] = created._id;
      ok(`Category: ${cat.name}`);
    }
  }

  // ── 3. Brands ───────────────────────────────────────────────────────────────
  let brandMap = {};
  for (const brand of brands) {
    const slug   = brand.name.toLowerCase().replace(/\s+/g, "-");
    const exists = await Brand.findOne({ name: brand.name });
    if (exists) {
      brandMap[slug] = exists._id;
      warn(`Brand exists: ${brand.name}`);
    } else {
      const created = await Brand.create({ ...brand, isActive: true });
      brandMap[slug] = created._id;
      ok(`Brand: ${brand.name}`);
    }
  }

  // ── 4. Sample medicines ─────────────────────────────────────────────────────
  const medicines = [
    {
      name:                 "Panadol Extra 500mg",
      nameAr:               "بنادول إكسترا 500 مجم",
      slug:                 "panadol-extra-500mg",
      description:          "Fast-acting paracetamol for pain and fever relief.",
      category:             catMap["pain-relief"],
      brand:                brandMap["panadol"],
      price:                15.00,
      stock:                200,
      lowStockThreshold:    20,
      sku:                  "PAN-500-EX",
      dosageForm:           "tablet",
      strength:             "500mg",
      requiresPrescription: false,
      isFeatured:           true,
      expiryDate:           new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000),
    },
    {
      name:                 "Brufen 400mg",
      nameAr:               "بروفين 400 مجم",
      slug:                 "brufen-400mg",
      description:          "Ibuprofen for pain, fever and inflammation.",
      category:             catMap["pain-relief"],
      brand:                brandMap["brufen"],
      price:                20.00,
      stock:                150,
      lowStockThreshold:    15,
      sku:                  "BRU-400",
      dosageForm:           "tablet",
      strength:             "400mg",
      requiresPrescription: false,
      isFeatured:           false,
      expiryDate:           new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000),
    },
    {
      name:                 "Augmentin 625mg",
      nameAr:               "أوجمنتين 625 مجم",
      slug:                 "augmentin-625mg",
      description:          "Amoxicillin/clavulanate antibiotic.",
      category:             catMap["antibiotics"],
      brand:                brandMap["augmentin"],
      price:                65.00,
      stock:                80,
      lowStockThreshold:    10,
      sku:                  "AUG-625",
      dosageForm:           "tablet",
      strength:             "625mg",
      requiresPrescription: true,
      isFeatured:           false,
      expiryDate:           new Date(Date.now() + 18 * 30 * 24 * 60 * 60 * 1000),
    },
    {
      name:                 "Vitamin C 1000mg Effervescent",
      nameAr:               "فيتامين C 1000 مجم فوار",
      slug:                 "vitamin-c-1000mg-effervescent",
      description:          "Effervescent vitamin C tablets for immune support.",
      category:             catMap["vitamins-supplements"],
      brand:                brandMap["vitamin-c"],
      price:                35.00,
      stock:                300,
      lowStockThreshold:    30,
      sku:                  "VIT-C-1000",
      dosageForm:           "effervescent",
      strength:             "1000mg",
      requiresPrescription: false,
      isFeatured:           true,
      expiryDate:           new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000),
    },
    {
      name:                 "Nexium 40mg",
      nameAr:               "نيكسيوم 40 مجم",
      slug:                 "nexium-40mg",
      description:          "Esomeprazole for acid reflux and GERD.",
      category:             catMap["cold-flu"],
      brand:                brandMap["nexium"],
      price:                85.00,
      stock:                5,
      lowStockThreshold:    10,
      sku:                  "NEX-40",
      dosageForm:           "capsule",
      strength:             "40mg",
      requiresPrescription: true,
      isFeatured:           false,
      expiryDate:           new Date(Date.now() + 12 * 30 * 24 * 60 * 60 * 1000),
    },
  ];

  for (const med of medicines) {
    const exists = await Medicine.findOne({ slug: med.slug });
    if (exists) {
      warn(`Medicine exists: ${med.name}`);
    } else {
      await Medicine.create(med);
      ok(`Medicine: ${med.name}`);
    }
  }

  console.log("\nSeeding complete.");
  await mongoose.connection.close();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
