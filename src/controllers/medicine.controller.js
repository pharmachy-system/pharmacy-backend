const Medicine = require("../models/Medicine.model");
const { uploadToCloudinary, deleteFromCloudinary } = require("../utils/cloudinary.util");
const User = require("../models/User.model");

// ─── List Medicines ───────────────────────────────────────────────────────────
exports.getAllMedicines = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const filter = { isActive: true };

    if (req.query.search) filter.$text = { $search: req.query.search };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.brand) filter.brand = req.query.brand;
    if (req.query.requiresPrescription !== undefined)
      filter.requiresPrescription = req.query.requiresPrescription === "true";
    if (req.query.inStock === "true") filter.stock = { $gt: 0 };
    if (req.query.featured === "true") filter.isFeatured = true;
    if (req.query.flashSale === "true") {
      filter.isFlashSale = true;
      filter.flashSaleEnd = { $gt: new Date() };
    }
    if (req.query.minPrice || req.query.maxPrice) {
      filter.finalPrice = {};
      if (req.query.minPrice) filter.finalPrice.$gte = parseFloat(req.query.minPrice);
      if (req.query.maxPrice) filter.finalPrice.$lte = parseFloat(req.query.maxPrice);
    }
    if (req.query.dosageForm) filter.dosageForm = req.query.dosageForm;
    if (req.query.tags) filter.tags = { $in: req.query.tags.split(",") };

    const sortMap = {
      price_asc: { finalPrice: 1 },
      price_desc: { finalPrice: -1 },
      rating: { rating: -1 },
      newest: { createdAt: -1 },
      bestseller: { soldCount: -1 },
      name: { name: 1 },
    };
    const sort = sortMap[req.query.sort] || { createdAt: -1 };

    const [medicines, total] = await Promise.all([
      Medicine.find(filter)
        .populate("category", "name slug")
        .populate("brand", "name logo")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select("-alternatives -relatedMedicines -ingredients -sideEffects -warnings"),
      Medicine.countDocuments(filter),
    ]);

    res.json({
      success: true,
      medicines,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Get Single ───────────────────────────────────────────────────────────────
exports.getMedicineById = async (req, res, next) => {
  try {
    const medicine = await Medicine.findOne({ _id: req.params.id, isActive: true })
      .populate("category", "name slug")
      .populate("brand", "name logo")
      .populate("alternatives", "name finalPrice images stock")
      .populate("relatedMedicines", "name finalPrice images stock");

    if (!medicine) return res.status(404).json({ success: false, message: "Medicine not found" });

    // Non-blocking: increment view count + track recently viewed for authenticated users
    setImmediate(() => {
      Medicine.findByIdAndUpdate(medicine._id, { $inc: { viewCount: 1 } }).exec().catch(() => {});
      if (req.user?._id) {
        User.findByIdAndUpdate(req.user._id, {
          $pull: { recentlyViewed: { medicine: medicine._id } },
        }).exec().catch(() => {}).then(() => {
          User.findByIdAndUpdate(req.user._id, {
            $push: { recentlyViewed: { $each: [{ medicine: medicine._id, viewedAt: new Date() }], $position: 0, $slice: 20 } },
          }).exec().catch(() => {});
        });
      }
    });

    res.json({ success: true, medicine });
  } catch (err) {
    next(err);
  }
};

exports.getMedicineBySlug = async (req, res, next) => {
  try {
    const medicine = await Medicine.findOne({ slug: req.params.slug, isActive: true })
      .populate("category", "name slug")
      .populate("brand", "name logo")
      .populate("alternatives", "name finalPrice images stock")
      .populate("relatedMedicines", "name finalPrice images stock");

    if (!medicine) return res.status(404).json({ success: false, message: "Medicine not found" });

    setImmediate(() => {
      Medicine.findByIdAndUpdate(medicine._id, { $inc: { viewCount: 1 } }).exec().catch(() => {});
      if (req.user?._id) {
        User.findByIdAndUpdate(req.user._id, {
          $pull: { recentlyViewed: { medicine: medicine._id } },
        }).exec().catch(() => {}).then(() => {
          User.findByIdAndUpdate(req.user._id, {
            $push: { recentlyViewed: { $each: [{ medicine: medicine._id, viewedAt: new Date() }], $position: 0, $slice: 20 } },
          }).exec().catch(() => {});
        });
      }
    });

    res.json({ success: true, medicine });
  } catch (err) {
    next(err);
  }
};

// ─── Create ───────────────────────────────────────────────────────────────────
exports.createMedicine = async (req, res, next) => {
  try {
    const medicine = await Medicine.create(req.body);

    if (req.files && req.files.length > 0) {
      const uploads = await Promise.all(
        req.files.map((file, i) =>
          uploadToCloudinary(file.buffer, "medicines").then((r) => ({
            url: r.secure_url,
            public_id: r.public_id,
            isMain: i === 0,
          }))
        )
      );
      medicine.images = uploads;
      await medicine.save();
    }

    res.status(201).json({ success: true, medicine });
  } catch (err) {
    next(err);
  }
};

// ─── Update ───────────────────────────────────────────────────────────────────
exports.updateMedicine = async (req, res, next) => {
  try {
    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) return res.status(404).json({ success: false, message: "Medicine not found" });

    if (req.files && req.files.length > 0) {
      for (const img of medicine.images) {
        if (img.public_id) await deleteFromCloudinary(img.public_id);
      }
      const uploads = await Promise.all(
        req.files.map((file, i) =>
          uploadToCloudinary(file.buffer, "medicines").then((r) => ({
            url: r.secure_url,
            public_id: r.public_id,
            isMain: i === 0,
          }))
        )
      );
      req.body.images = uploads;
    }

    Object.assign(medicine, req.body);
    await medicine.save();
    res.json({ success: true, medicine });
  } catch (err) {
    next(err);
  }
};

// ─── Delete (soft) ────────────────────────────────────────────────────────────
exports.deleteMedicine = async (req, res, next) => {
  try {
    const medicine = await Medicine.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!medicine) return res.status(404).json({ success: false, message: "Medicine not found" });
    res.json({ success: true, message: "Medicine deactivated" });
  } catch (err) {
    next(err);
  }
};

// ─── Stock ────────────────────────────────────────────────────────────────────
exports.getLowStockMedicines = async (req, res, next) => {
  try {
    const medicines = await Medicine.find({
      isActive: true,
      $expr: { $lte: ["$stock", "$lowStockThreshold"] },
    })
      .populate("category", "name")
      .sort({ stock: 1 });

    res.json({ success: true, count: medicines.length, medicines });
  } catch (err) {
    next(err);
  }
};

exports.getExpiringMedicines = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const medicines = await Medicine.find({
      isActive: true,
      expiryDate: { $lte: cutoff, $gt: new Date() },
    })
      .populate("category", "name")
      .sort({ expiryDate: 1 });

    res.json({ success: true, count: medicines.length, medicines });
  } catch (err) {
    next(err);
  }
};

exports.updateStock = async (req, res, next) => {
  try {
    const { quantity, operation = "set" } = req.body;
    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) return res.status(404).json({ success: false, message: "Medicine not found" });

    if (operation === "add") medicine.stock += Number(quantity);
    else if (operation === "subtract") {
      if (medicine.stock < quantity)
        return res.status(400).json({ success: false, message: "Insufficient stock" });
      medicine.stock -= Number(quantity);
    } else {
      medicine.stock = Number(quantity);
    }
    await medicine.save();
    res.json({ success: true, medicine });
  } catch (err) {
    next(err);
  }
};

// ─── Drug Interaction Checker ─────────────────────────────────────────────────
exports.checkInteractions = async (req, res, next) => {
  try {
    const { medicineIds } = req.body;
    if (!medicineIds || medicineIds.length < 2)
      return res.status(400).json({ success: false, message: "Provide at least 2 medicine IDs" });

    const medicines = await Medicine.find({ _id: { $in: medicineIds } }).select(
      "name ingredients tags warnings"
    );

    const interactions = [];
    for (let i = 0; i < medicines.length; i++) {
      for (let j = i + 1; j < medicines.length; j++) {
        const a = medicines[i];
        const b = medicines[j];
        const shared = (a.ingredients || []).filter((ing) =>
          (b.ingredients || []).some((bi) => bi.toLowerCase() === ing.toLowerCase())
        );
        if (shared.length > 0) {
          interactions.push({
            medicines: [a.name, b.name],
            sharedIngredients: shared,
            severity: "moderate",
            warning: `Both ${a.name} and ${b.name} contain: ${shared.join(", ")}. Consult your pharmacist.`,
          });
        }
      }
    }

    res.json({
      success: true,
      medicines: medicines.map((m) => ({ id: m._id, name: m.name })),
      interactions,
      hasInteractions: interactions.length > 0,
    });
  } catch (err) {
    next(err);
  }
};

// ─── Smart Search (AI-ready) ──────────────────────────────────────────────────
// Full-text + faceted search with category/brand/price aggregation in one call.
// This endpoint is intentionally hook-ready: the `query` field can be forwarded
// to an embedding/vector search service before falling back to MongoDB $text.
exports.smartSearch = async (req, res, next) => {
  try {
    const q     = (req.query.q || "").trim();
    const page  = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip  = (page - 1) * limit;

    if (!q) return res.status(400).json({ success: false, message: "Query parameter 'q' is required | معامل البحث 'q' مطلوب" });

    const baseFilter = { isActive: true };

    // Primary: MongoDB full-text search (uses the existing text index on name/nameAr/description/tags)
    const textFilter = { ...baseFilter, $text: { $search: q } };

    // Fallback: regex on name / nameAr for short/partial queries
    const escaped      = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regexFilter  = { ...baseFilter, $or: [
      { name:   { $regex: escaped, $options: "i" } },
      { nameAr: { $regex: escaped, $options: "i" } },
      { tags:   { $regex: escaped, $options: "i" } },
    ]};

    // Apply optional facet filters on top of the search
    if (req.query.category) { textFilter.category = req.query.category; regexFilter.category = req.query.category; }
    if (req.query.brand)    { textFilter.brand    = req.query.brand;    regexFilter.brand    = req.query.brand; }
    if (req.query.minPrice || req.query.maxPrice) {
      const pf = {};
      if (req.query.minPrice) pf.$gte = parseFloat(req.query.minPrice);
      if (req.query.maxPrice) pf.$lte = parseFloat(req.query.maxPrice);
      textFilter.finalPrice  = pf;
      regexFilter.finalPrice = pf;
    }
    if (req.query.inStock === "true") { textFilter.stock = { $gt: 0 }; regexFilter.stock = { $gt: 0 }; }
    if (req.query.requiresPrescription !== undefined) {
      const val = req.query.requiresPrescription === "true";
      textFilter.requiresPrescription  = val;
      regexFilter.requiresPrescription = val;
    }

    const selectFields = "name nameAr slug images category brand finalPrice price salePrice discount stock requiresPrescription dosageForm rating reviewCount isFeatured isFlashSale";

    // Run text search; if no results, fall back to regex
    let [medicines, total] = await Promise.all([
      Medicine.find(textFilter)
        .populate("category", "name slug")
        .populate("brand", "name logo")
        .sort({ score: { $meta: "textScore" }, soldCount: -1 })
        .skip(skip)
        .limit(limit)
        .select(selectFields),
      Medicine.countDocuments(textFilter),
    ]);

    let usedFallback = false;
    if (!medicines.length) {
      usedFallback = true;
      [medicines, total] = await Promise.all([
        Medicine.find(regexFilter)
          .populate("category", "name slug")
          .populate("brand", "name logo")
          .sort({ soldCount: -1, rating: -1 })
          .skip(skip)
          .limit(limit)
          .select(selectFields),
        Medicine.countDocuments(regexFilter),
      ]);
    }

    // Facets: category & brand breakdown for the current result set (no pagination)
    const facetFilter = usedFallback ? regexFilter : textFilter;
    const [categoryFacets, brandFacets] = await Promise.all([
      Medicine.aggregate([
        { $match: facetFilter },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "cat" } },
        { $unwind: { path: "$cat", preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, name: "$cat.name", count: 1 } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      Medicine.aggregate([
        { $match: { ...facetFilter, brand: { $ne: null } } },
        { $group: { _id: "$brand", count: { $sum: 1 } } },
        { $lookup: { from: "brands", localField: "_id", foreignField: "_id", as: "br" } },
        { $unwind: { path: "$br", preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, name: "$br.name", logo: "$br.logo", count: 1 } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    res.json({
      success: true,
      query: q,
      medicines,
      facets: { categories: categoryFacets, brands: brandFacets },
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      meta: { usedFallback, resultCount: medicines.length },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Get Alternatives ─────────────────────────────────────────────────────────
exports.getAlternatives = async (req, res, next) => {
  try {
    const medicine = await Medicine.findById(req.params.id)
      .populate("alternatives", "name nameAr slug images finalPrice stock requiresPrescription rating dosageForm category brand")
      .populate("relatedMedicines", "name nameAr slug images finalPrice stock requiresPrescription rating");

    if (!medicine) return res.status(404).json({ success: false, message: "Medicine not found | الدواء غير موجود" });

    res.json({
      success: true,
      medicineId: medicine._id,
      medicineName: medicine.name,
      alternatives: medicine.alternatives || [],
      relatedMedicines: medicine.relatedMedicines || [],
    });
  } catch (err) {
    next(err);
  }
};

// ─── Manage Alternatives (admin) ──────────────────────────────────────────────
exports.updateAlternatives = async (req, res, next) => {
  try {
    const { add = [], remove = [] } = req.body;

    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) return res.status(404).json({ success: false, message: "Medicine not found | الدواء غير موجود" });

    const current = (medicine.alternatives || []).map((id) => id.toString());
    const addSet    = add.filter((id) => !current.includes(id) && id !== req.params.id);
    const removeSet = new Set(remove.map(String));

    medicine.alternatives = [
      ...current.filter((id) => !removeSet.has(id)),
      ...addSet,
    ];

    await medicine.save();
    await medicine.populate("alternatives", "name nameAr slug finalPrice stock");

    res.json({ success: true, alternatives: medicine.alternatives });
  } catch (err) {
    next(err);
  }
};

// ─── Recommendations ──────────────────────────────────────────────────────────
// Returns medicines in the same category, ranked by popularity.
// Excludes the source medicine. Intentionally simple — can be upgraded to
// collaborative-filtering or vector similarity without changing the route contract.
exports.getRecommendations = async (req, res, next) => {
  try {
    const medicine = await Medicine.findOne({ _id: req.params.id, isActive: true }).select("category brand tags");
    if (!medicine) return res.status(404).json({ success: false, message: "Medicine not found | الدواء غير موجود" });

    const recommendations = await Medicine.find({
      _id: { $ne: medicine._id },
      isActive: true,
      stock: { $gt: 0 },
      category: medicine.category,
    })
      .sort({ soldCount: -1, rating: -1 })
      .limit(8)
      .select("name nameAr slug images finalPrice price discount stock requiresPrescription rating reviewCount dosageForm")
      .populate("brand", "name logo")
      .lean();

    res.json({ success: true, recommendations, basedOn: "category" });
  } catch (err) {
    next(err);
  }
};

// ─── Autocomplete / Suggest ───────────────────────────────────────────────────
// Lightweight prefix-match for search bars. Returns names only — intentionally
// minimal to keep response fast and payload small.
exports.searchSuggest = async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    if (q.length < 2) return res.json({ success: true, suggestions: [] });

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const suggestions = await Medicine.find({
      isActive: true,
      $or: [
        { name:   { $regex: `^${escaped}`, $options: "i" } },
        { nameAr: { $regex: `^${escaped}`, $options: "i" } },
      ],
    })
      .sort({ soldCount: -1 })
      .limit(10)
      .select("name nameAr slug finalPrice images requiresPrescription")
      .lean();

    res.json({ success: true, query: q, suggestions });
  } catch (err) {
    next(err);
  }
};
