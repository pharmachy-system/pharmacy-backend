const Brand = require("../models/Brand.model");
const { uploadToCloudinary, deleteFromCloudinary } = require("../utils/cloudinary.util");

exports.getAllBrands = async (req, res, next) => {
  try {
    const filter = { isActive: true };
    if (req.query.featured) filter.isFeatured = true;
    if (req.query.search) {
      const escaped = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.name = { $regex: escaped, $options: "i" };
    }

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const skip = (page - 1) * limit;

    const [brands, total] = await Promise.all([
      Brand.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
      Brand.countDocuments(filter),
    ]);

    res.json({ success: true, brands, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

exports.getBrandById = async (req, res, next) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(404).json({ success: false, message: "Brand not found" });
    res.json({ success: true, brand });
  } catch (err) {
    next(err);
  }
};

exports.createBrand = async (req, res, next) => {
  try {
    const brand = await Brand.create(req.body);

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "brands");
      brand.logo = result.secure_url;
      await brand.save();
    }

    res.status(201).json({ success: true, brand });
  } catch (err) {
    next(err);
  }
};

exports.updateBrand = async (req, res, next) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(404).json({ success: false, message: "Brand not found" });

    if (req.file) {
      if (brand.logo) {
        const pubId = brand.logo.split("/").slice(-2).join("/").split(".")[0];
        await deleteFromCloudinary(pubId);
      }
      const result = await uploadToCloudinary(req.file.buffer, "brands");
      req.body.logo = result.secure_url;
    }

    Object.assign(brand, req.body);
    await brand.save();

    res.json({ success: true, brand });
  } catch (err) {
    next(err);
  }
};

exports.deleteBrand = async (req, res, next) => {
  try {
    const brand = await Brand.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!brand) return res.status(404).json({ success: false, message: "Brand not found" });
    res.json({ success: true, message: "Brand deactivated" });
  } catch (err) {
    next(err);
  }
};
