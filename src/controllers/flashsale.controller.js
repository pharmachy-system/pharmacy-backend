const FlashSale = require("../models/FlashSale.model");
const Medicine = require("../models/Medicine.model");
const { uploadToCloudinary, deleteFromCloudinary } = require("../utils/cloudinary.util");

// ─── Get Active Flash Sale ────────────────────────────────────────────────────
exports.getActiveFlashSale = async (req, res, next) => {
  try {
    const now = new Date();
    const sale = await FlashSale.findOne({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    })
      .populate("medicines", "name images finalPrice flashSalePrice rating stock requiresPrescription")
      .sort({ createdAt: -1 });

    if (!sale) return res.json({ success: true, sale: null, message: "No active flash sale" });

    const timeLeft = Math.max(0, sale.endDate - now);
    res.json({ success: true, sale, timeLeftMs: timeLeft });
  } catch (err) {
    next(err);
  }
};

// ─── Get All Flash Sales (admin) ──────────────────────────────────────────────
exports.getAllFlashSales = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === "true";
    if (req.query.live === "true") {
      const now = new Date();
      filter.startDate = { $lte: now };
      filter.endDate = { $gte: now };
      filter.isActive = true;
    }

    const [sales, total] = await Promise.all([
      FlashSale.find(filter)
        .populate("createdBy", "name")
        .sort({ startDate: -1 })
        .skip(skip)
        .limit(limit),
      FlashSale.countDocuments(filter),
    ]);

    res.json({ success: true, sales, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

// ─── Get Single Flash Sale ────────────────────────────────────────────────────
exports.getFlashSaleById = async (req, res, next) => {
  try {
    const sale = await FlashSale.findById(req.params.id)
      .populate("medicines", "name images price finalPrice stock")
      .populate("createdBy", "name");
    if (!sale) return res.status(404).json({ success: false, message: "Flash sale not found" });
    res.json({ success: true, sale });
  } catch (err) {
    next(err);
  }
};

// ─── Create Flash Sale ────────────────────────────────────────────────────────
exports.createFlashSale = async (req, res, next) => {
  try {
    const { name, description, startDate, endDate, discount, medicineIds } = req.body;

    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ success: false, message: "endDate must be after startDate" });
    }

    const sale = await FlashSale.create({
      name,
      description,
      startDate,
      endDate,
      discount,
      medicines: medicineIds || [],
      createdBy: req.user._id,
    });

    // Upload banner if provided
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "flash-sales");
      sale.banner = { url: result.secure_url, public_id: result.public_id };
      await sale.save();
    }

    // Apply flash sale prices to medicines
    if (medicineIds && medicineIds.length > 0) {
      await _applyFlashSalePrices(medicineIds, discount, endDate);
    }

    res.status(201).json({ success: true, sale });
  } catch (err) {
    next(err);
  }
};

// ─── Update Flash Sale ────────────────────────────────────────────────────────
exports.updateFlashSale = async (req, res, next) => {
  try {
    const sale = await FlashSale.findById(req.params.id);
    if (!sale) return res.status(404).json({ success: false, message: "Flash sale not found" });

    // If medicines or discount changed, reapply prices
    const discountChanged = req.body.discount !== undefined && req.body.discount !== sale.discount;
    const medicinesChanged = req.body.medicineIds !== undefined;

    if (req.file) {
      if (sale.banner?.public_id) await deleteFromCloudinary(sale.banner.public_id);
      const result = await uploadToCloudinary(req.file.buffer, "flash-sales");
      req.body.banner = { url: result.secure_url, public_id: result.public_id };
    }

    // Remove old flash sale prices if medicines list changed
    if (medicinesChanged) {
      await _removeFlashSalePrices(sale.medicines);
      req.body.medicines = req.body.medicineIds;
    }

    Object.assign(sale, req.body);
    await sale.save();

    // Reapply prices
    if ((discountChanged || medicinesChanged) && sale.medicines.length > 0) {
      await _applyFlashSalePrices(sale.medicines, sale.discount, sale.endDate);
    }

    res.json({ success: true, sale });
  } catch (err) {
    next(err);
  }
};

// ─── Toggle Active ────────────────────────────────────────────────────────────
exports.toggleFlashSale = async (req, res, next) => {
  try {
    const sale = await FlashSale.findById(req.params.id);
    if (!sale) return res.status(404).json({ success: false, message: "Flash sale not found" });

    sale.isActive = !sale.isActive;
    await sale.save();

    if (sale.isActive) {
      await _applyFlashSalePrices(sale.medicines, sale.discount, sale.endDate);
    } else {
      await _removeFlashSalePrices(sale.medicines);
    }

    res.json({ success: true, isActive: sale.isActive, message: `Flash sale ${sale.isActive ? "activated" : "deactivated"}` });
  } catch (err) {
    next(err);
  }
};

// ─── Delete Flash Sale ────────────────────────────────────────────────────────
exports.deleteFlashSale = async (req, res, next) => {
  try {
    const sale = await FlashSale.findById(req.params.id);
    if (!sale) return res.status(404).json({ success: false, message: "Flash sale not found" });

    // Remove flash sale prices from medicines
    await _removeFlashSalePrices(sale.medicines);

    if (sale.banner?.public_id) await deleteFromCloudinary(sale.banner.public_id);
    await sale.deleteOne();

    res.json({ success: true, message: "Flash sale deleted" });
  } catch (err) {
    next(err);
  }
};

// ─── Add / Remove Medicines ───────────────────────────────────────────────────
exports.addMedicines = async (req, res, next) => {
  try {
    const { medicineIds } = req.body;
    const sale = await FlashSale.findById(req.params.id);
    if (!sale) return res.status(404).json({ success: false, message: "Flash sale not found" });

    const newIds = medicineIds.filter((id) => !sale.medicines.map(String).includes(String(id)));
    sale.medicines.push(...newIds);
    await sale.save();

    if (sale.isLive) {
      await _applyFlashSalePrices(newIds, sale.discount, sale.endDate);
    }

    res.json({ success: true, sale });
  } catch (err) {
    next(err);
  }
};

exports.removeMedicines = async (req, res, next) => {
  try {
    const { medicineIds } = req.body;
    const sale = await FlashSale.findById(req.params.id);
    if (!sale) return res.status(404).json({ success: false, message: "Flash sale not found" });

    await _removeFlashSalePrices(medicineIds);
    sale.medicines = sale.medicines.filter((id) => !medicineIds.map(String).includes(String(id)));
    await sale.save();

    res.json({ success: true, sale });
  } catch (err) {
    next(err);
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const _applyFlashSalePrices = async (medicineIds, discountPct, endDate) => {
  const medicines = await Medicine.find({ _id: { $in: medicineIds } });
  for (const med of medicines) {
    med.isFlashSale = true;
    med.flashSalePrice = parseFloat((med.finalPrice * (1 - discountPct / 100)).toFixed(2));
    med.flashSaleEnd = endDate;
    await med.save();
  }
};

const _removeFlashSalePrices = async (medicineIds) => {
  await Medicine.updateMany(
    { _id: { $in: medicineIds } },
    { isFlashSale: false, flashSalePrice: null, flashSaleEnd: null }
  );
};
