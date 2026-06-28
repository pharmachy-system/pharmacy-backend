/**
 * App controller — aggregated endpoints for client app bootstrapping.
 * Designed to minimise round trips from the home screen and app startup.
 */

const Category     = require("../models/Category.model");
const Medicine     = require("../models/Medicine.model");
const Brand        = require("../models/Brand.model");
const Article      = require("../models/Article.model");
const FlashSale    = require("../models/FlashSale.model");
const DeliveryZone = require("../models/DeliveryZone.model");

// GET /api/app/home
// Returns everything the home screen needs in a single request.
exports.getHomeScreen = async (req, res, next) => {
  try {
    const now = new Date();

    const [
      categories,
      featuredMedicines,
      newArrivals,
      flashSale,
      brands,
      articles,
    ] = await Promise.all([
      Category.find({ isActive: true, isFeatured: true, parent: null })
        .sort({ order: 1, name: 1 })
        .limit(8)
        .select("name nameAr slug image"),

      Medicine.find({ isActive: true, isFeatured: true })
        .sort({ soldCount: -1 })
        .limit(12)
        .select("name nameAr slug images finalPrice salePrice flashSalePrice isFlashSale rating reviewCount stock requiresPrescription")
        .populate("brand", "name")
        .populate("category", "name slug"),

      Medicine.find({ isActive: true })
        .sort({ createdAt: -1 })
        .limit(10)
        .select("name nameAr slug images finalPrice salePrice rating reviewCount stock requiresPrescription")
        .populate("category", "name slug"),

      FlashSale.findOne({
        isActive: true,
        startDate: { $lte: now },
        endDate:   { $gte: now },
      })
        .sort({ createdAt: -1 })
        .populate("medicines", "name images finalPrice flashSalePrice rating stock requiresPrescription slug"),

      Brand.find({ isActive: true, isFeatured: true })
        .sort({ name: 1 })
        .limit(8)
        .select("name logo slug"),

      Article.find({ status: "published" })
        .sort({ publishedAt: -1 })
        .limit(5)
        .select("title titleAr slug image publishedAt category readTime")
        .populate("category", "name"),
    ]);

    res.json({
      success: true,
      data: {
        categories,
        featuredMedicines,
        newArrivals,
        flashSale: flashSale
          ? { ...flashSale.toObject(), timeLeftMs: Math.max(0, flashSale.endDate - now) }
          : null,
        brands,
        articles,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/app/config
// App configuration: maintenance mode, minimum supported app version, etc.
// Values are read from env vars so they can be changed without deployment.
exports.getAppConfig = async (req, res, next) => {
  try {
    const [zones] = await Promise.all([
      DeliveryZone.countDocuments({ isActive: true }),
    ]);

    res.json({
      success: true,
      config: {
        maintenanceMode:    process.env.MAINTENANCE_MODE === "true",
        maintenanceMessage: process.env.MAINTENANCE_MESSAGE || null,
        minAppVersion: {
          ios:     process.env.MIN_IOS_VERSION     || "1.0.0",
          android: process.env.MIN_ANDROID_VERSION || "1.0.0",
        },
        latestAppVersion: {
          ios:     process.env.LATEST_IOS_VERSION     || "1.0.0",
          android: process.env.LATEST_ANDROID_VERSION || "1.0.0",
        },
        supportedPaymentMethods: ["cash", "card", "wallet"],
        activeDeliveryZones:     zones,
        currency:                "SAR",
        defaultLanguage:         "ar",
        supportedLanguages:      ["ar", "en"],
        contactPhone:            process.env.SUPPORT_PHONE    || null,
        contactEmail:            process.env.SUPPORT_EMAIL    || null,
        whatsappNumber:          process.env.WHATSAPP_NUMBER  || null,
        features: {
          aiChat:             process.env.FEATURE_AI_CHAT          !== "false",
          aiSymptomChecker:   process.env.FEATURE_AI_SYMPTOMS       !== "false",
          aiMedicineAssist:   process.env.FEATURE_AI_MEDICINE       !== "false",
          drugInteractions:   process.env.FEATURE_DRUG_INTERACTIONS !== "false",
          smartSearch:        process.env.FEATURE_SMART_SEARCH      !== "false",
          prescriptionOCR:    process.env.FEATURE_PRESCRIPTION_OCR  !== "false",
          passkeys:           process.env.FEATURE_PASSKEYS          !== "false",
          guestShopping:      process.env.FEATURE_GUEST_SHOPPING    !== "false",
          nafathLogin:        process.env.FEATURE_NAFATH            !== "false",
          darkMode:           process.env.FEATURE_DARK_MODE         !== "false",
          hasAIKey:           !!process.env.ANTHROPIC_API_KEY,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};
