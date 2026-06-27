const Prescription = require("../models/Prescription.model");
const { uploadToCloudinary } = require("../utils/cloudinary.util");
const { createNotification } = require("../utils/notification.util");

// ─── Get All (admin/pharmacist) ───────────────────────────────────────────────
exports.getAllPrescriptions = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const filter = {};
    if (typeof req.query.status === "string") filter.status = req.query.status;
    if (typeof req.query.userId === "string") filter.user   = req.query.userId;

    const [prescriptions, total] = await Promise.all([
      Prescription.find(filter)
        .populate("user", "name email phone")
        .populate("reviewedBy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Prescription.countDocuments(filter),
    ]);

    res.json({ success: true, prescriptions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

// ─── Get Single ───────────────────────────────────────────────────────────────
exports.getPrescriptionById = async (req, res, next) => {
  try {
    const prescription = await Prescription.findById(req.params.id)
      .populate("user", "name email phone")
      .populate("reviewedBy", "name");

    if (!prescription) return res.status(404).json({ success: false, message: "Prescription not found" });

    if (req.user.role === "customer" && prescription.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    res.json({ success: true, prescription });
  } catch (err) {
    next(err);
  }
};

// ─── Create (upload) ──────────────────────────────────────────────────────────
exports.createPrescription = async (req, res, next) => {
  try {
    const data = {
      user: req.user._id,
      doctor: req.body.doctor,
      hospitalClinic: req.body.hospitalClinic,
      medicines: req.body.medicines ? JSON.parse(req.body.medicines) : [],
      expiryDate: req.body.expiryDate,
      notes: req.body.notes,
    };

    // Upload prescription images
    if (req.files && req.files.length > 0) {
      const uploads = await Promise.all(
        req.files.map((file) =>
          uploadToCloudinary(file.buffer, "prescriptions").then((r) => ({
            url: r.secure_url,
            public_id: r.public_id,
          }))
        )
      );
      data.images = uploads;
    }

    const prescription = await Prescription.create(data);

    res.status(201).json({ success: true, prescription });
  } catch (err) {
    next(err);
  }
};

// ─── Update Status (pharmacist/admin) ────────────────────────────────────────
exports.updatePrescriptionStatus = async (req, res, next) => {
  try {
    const { status, notes, rejectionReason } = req.body;

    const prescription = await Prescription.findById(req.params.id).populate("user", "name");
    if (!prescription) return res.status(404).json({ success: false, message: "Prescription not found" });

    prescription.status = status;
    prescription.reviewedBy = req.user._id;
    prescription.reviewedAt = new Date();
    if (notes) prescription.notes = notes;
    if (rejectionReason) prescription.rejectionReason = rejectionReason;

    await prescription.save();

    // Notify user
    const messages = {
      approved: "Your prescription has been approved. You can now place your order.",
      rejected: `Your prescription was rejected. ${rejectionReason || ""}`,
      under_review: "Your prescription is under review.",
      expired: "Your prescription has expired.",
    };

    if (messages[status]) {
      await createNotification({
        userId: prescription.user._id,
        type: "prescription",
        title: `Prescription ${status.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}`,
        body: messages[status],
        data: { prescriptionId: prescription._id },
      });
    }

    res.json({ success: true, prescription });
  } catch (err) {
    next(err);
  }
};

// ─── Get User's Prescriptions ─────────────────────────────────────────────────
exports.getUserPrescriptions = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(100, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const [prescriptions, total] = await Promise.all([
      Prescription.find(filter).populate("reviewedBy", "name").sort({ createdAt: -1 }).skip(skip).limit(limit),
      Prescription.countDocuments(filter),
    ]);

    res.json({ success: true, prescriptions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};
