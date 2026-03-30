const Medicine = require("../models/Medicine.model");
const { uploadToCloudinary, deleteFromCloudinary } = require("../utils/cloudinary.util");

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
    Medicine.findByIdAndUpdate(medicine._id, { $inc: { viewCount: 1 } }).exec();
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
    Medicine.findByIdAndUpdate(medicine._id, { $inc: { viewCount: 1 } }).exec();
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
