/**
 * ensure-indexes.js
 *
 * Run this script after each deployment to ensure all Mongoose-defined indexes
 * exist in MongoDB Atlas. Safe to run multiple times (idempotent).
 *
 * Usage:
 *   node scripts/ensure-indexes.js
 */

require("dotenv").config();
const mongoose = require("mongoose");

// Import every model so Mongoose registers its schema (and therefore its indexes)
require("../src/models/User.model");
require("../src/models/Session.model");
require("../src/models/Medicine.model");
require("../src/models/Category.model");
require("../src/models/Brand.model");
require("../src/models/Cart.model");
require("../src/models/Wishlist.model");
require("../src/models/Order.model");
require("../src/models/Payment.model");
require("../src/models/Return.model");
require("../src/models/Prescription.model");
require("../src/models/Review.model");
require("../src/models/Coupon.model");
require("../src/models/FlashSale.model");
require("../src/models/DeliveryZone.model");
require("../src/models/Notification.model");
require("../src/models/Wallet.model");
require("../src/models/LoyaltyTransaction.model");
require("../src/models/GuestSession.model");
require("../src/models/Article.model");

async function ensureIndexes() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI environment variable is not set.");
    process.exit(1);
  }

  console.log("Connecting to MongoDB…");
  await mongoose.connect(uri);
  console.log("Connected.\n");

  const modelNames = Object.keys(mongoose.models);
  console.log(`Ensuring indexes for ${modelNames.length} models:\n`);

  const results = await Promise.allSettled(
    modelNames.map(async (name) => {
      const model = mongoose.models[name];
      await model.createIndexes();
      return name;
    })
  );

  let passed = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled") {
      console.log(`  ✓ ${r.value}`);
      passed++;
    } else {
      console.error(`  ✗ ${r.reason?.message || r.reason}`);
      failed++;
    }
  }

  console.log(`\n${passed} succeeded, ${failed} failed.`);
  await mongoose.connection.close();
  process.exit(failed > 0 ? 1 : 0);
}

ensureIndexes().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
