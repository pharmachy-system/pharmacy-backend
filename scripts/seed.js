/**
 * Database seeder — run once to bootstrap initial data.
 *
 * Usage:
 *   node scripts/seed.js
 *   node scripts/seed.js --fresh   # drops existing data first
 */

require("dotenv").config();
const mongoose = require("mongoose");

const User         = require("../src/models/User.model");
const Category     = require("../src/models/Category.model");
const Brand        = require("../src/models/Brand.model");
const Medicine     = require("../src/models/Medicine.model");
const DeliveryZone = require("../src/models/DeliveryZone.model");
const Coupon       = require("../src/models/Coupon.model");
const Wallet       = require("../src/models/Wallet.model");

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
      DeliveryZone.deleteMany({}),
      Coupon.deleteMany({}),
    ]);
    await User.deleteMany({
      email: {
        $in: [
          process.env.SEED_ADMIN_EMAIL      || "admin@pharmacy.sa",
          process.env.SEED_PHARMACIST_EMAIL  || "pharmacist@pharmacy.sa",
          process.env.SEED_DRIVER_EMAIL      || "driver@pharmacy.sa",
        ],
      },
    });
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

  // ── 5. Delivery zones ───────────────────────────────────────────────────────
  const zones = [
    {
      name: "Riyadh Central",
      nameAr: "وسط الرياض",
      cities: ["Riyadh", "Al Malaz", "Al Olaya"],
      deliveryFee: 15,
      freeDeliveryThreshold: 100,
      minDeliveryTime: 1,
      maxDeliveryTime: 3,
      isActive: true,
      slots: [
        { from: "09:00", to: "13:00", isActive: true, maxOrders: 50 },
        { from: "13:00", to: "17:00", isActive: true, maxOrders: 50 },
        { from: "17:00", to: "21:00", isActive: true, maxOrders: 30 },
      ],
    },
    {
      name: "Riyadh East",
      nameAr: "شرق الرياض",
      cities: ["Al Rawdah", "Al Shifa", "Al Naseem"],
      deliveryFee: 20,
      freeDeliveryThreshold: 150,
      minDeliveryTime: 2,
      maxDeliveryTime: 4,
      isActive: true,
      slots: [
        { from: "09:00", to: "13:00", isActive: true, maxOrders: 30 },
        { from: "17:00", to: "21:00", isActive: true, maxOrders: 30 },
      ],
    },
    {
      name: "Jeddah",
      nameAr: "جدة",
      cities: ["Jeddah", "Al Balad", "Al Rawdah"],
      deliveryFee: 25,
      freeDeliveryThreshold: 200,
      minDeliveryTime: 24,
      maxDeliveryTime: 48,
      isActive: true,
      slots: [
        { from: "10:00", to: "14:00", isActive: true, maxOrders: 20 },
        { from: "18:00", to: "22:00", isActive: true, maxOrders: 20 },
      ],
    },
  ];

  for (const zone of zones) {
    const exists = await DeliveryZone.findOne({ name: zone.name });
    if (exists) {
      warn(`Zone exists: ${zone.name}`);
    } else {
      await DeliveryZone.create(zone);
      ok(`Zone: ${zone.name}`);
    }
  }

  // ── 6. Welcome coupon ────────────────────────────────────────────────────────
  const welcomeCoupon = {
    code: "WELCOME15",
    description: "15% off your first order",
    type: "percentage",
    value: 15,
    minOrderAmount: 50,
    maxDiscount: 50,
    usageLimit: null,
    perUserLimit: 1,
    validFrom: new Date(),
    validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    isActive: true,
    isFirstOrderOnly: true,
  };

  const couponExists = await Coupon.findOne({ code: welcomeCoupon.code });
  if (couponExists) {
    warn(`Coupon exists: ${welcomeCoupon.code}`);
  } else {
    await Coupon.create(welcomeCoupon);
    ok(`Coupon: ${welcomeCoupon.code} (15% off first order, max SAR 50)`);
  }

  // ── 7. Pharmacist user ──────────────────────────────────────────────────────
  const pharmacistEmail    = process.env.SEED_PHARMACIST_EMAIL    || "pharmacist@pharmacy.sa";
  const pharmacistPassword = process.env.SEED_PHARMACIST_PASSWORD || "Pharmacist@123";

  const existingPharmacist = await User.findOne({ email: pharmacistEmail });
  if (existingPharmacist) {
    warn(`Pharmacist already exists: ${pharmacistEmail}`);
  } else {
    const bcrypt = require("bcryptjs");
    const hash   = await bcrypt.hash(pharmacistPassword, 12);
    await User.create({
      name:            "Sara Al-Zahrani",
      email:           pharmacistEmail,
      password:        hash,
      role:            "pharmacist",
      isEmailVerified: true,
      isActive:        true,
    });
    ok(`Pharmacist created: ${pharmacistEmail} / ${pharmacistPassword}`);
  }

  // ── 8. Delivery driver ──────────────────────────────────────────────────────
  const driverEmail    = process.env.SEED_DRIVER_EMAIL    || "driver@pharmacy.sa";
  const driverPassword = process.env.SEED_DRIVER_PASSWORD || "Driver@123456";

  const existingDriver = await User.findOne({ email: driverEmail });
  if (existingDriver) {
    warn(`Driver already exists: ${driverEmail}`);
  } else {
    const bcrypt = require("bcryptjs");
    const hash   = await bcrypt.hash(driverPassword, 12);
    const driver = await User.create({
      name:            "Mohammed Al-Harbi",
      email:           driverEmail,
      password:        hash,
      role:            "delivery",
      isEmailVerified: true,
      isActive:        true,
      driverStatus:    "available",
    });
    // Create wallet for driver
    await Wallet.create({ user: driver._id, balance: 0 });
    ok(`Driver created: ${driverEmail} / ${driverPassword}`);
  }

  // ── 9. Wallets for admin + pharmacist ───────────────────────────────────────
  for (const email of [adminEmail, pharmacistEmail]) {
    const u = await User.findOne({ email });
    if (u) {
      const walletExists = await Wallet.findOne({ user: u._id });
      if (!walletExists) {
        await Wallet.create({ user: u._id, balance: 0 });
        ok(`Wallet created for ${email}`);
      }
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
