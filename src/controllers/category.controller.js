const Category = require("../models/Category.model");
const { uploadToCloudinary, deleteFromCloudinary } = require("../utils/cloudinary.util");
const Medicine = require("../models/Medicine.model");

exports.getAllCategories = async (req, res, next) => {
  try {
    const filter = { isActive: true };
    if (req.query.featured) filter.isFeatured = true;

    // Top-level only unless parentId specified
    if (typeof req.query.parent === "string") filter.parent = req.query.parent;
    else if (req.query.topLevel !== "false") filter.parent = null;

    const categories = await Category.find(filter)
      .sort({ order: 1, name: 1 })
      .populate("parent", "name slug");

    res.json({ success: true, count: categories.length, categories });
  } catch (err) {
    next(err);
  }
};

exports.getCategoryById = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id).populate("parent", "name slug");
    if (!category) return res.status(404).json({ success: false, message: "Category not found" });

    // Also fetch subcategories
    const subcategories = await Category.find({ parent: category._id, isActive: true }).sort({ order: 1, name: 1 });
    res.json({ success: true, category, subcategories });
  } catch (err) {
    next(err);
  }
};

exports.createCategory = async (req, res, next) => {
  try {
    const category = await Category.create(req.body);

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "categories");
      category.image = result.secure_url;
      await category.save();
    }

    res.status(201).json({ success: true, category });
  } catch (err) {
    next(err);
  }
};

exports.updateCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: "Category not found" });

    if (req.file) {
      if (category.image) {
        const pubId = category.image.split("/").slice(-2).join("/").split(".")[0];
        await deleteFromCloudinary(pubId);
      }
      const result = await uploadToCloudinary(req.file.buffer, "categories");
      req.body.image = result.secure_url;
    }

    Object.assign(category, req.body);
    await category.save();
    res.json({ success: true, category });
  } catch (err) {
    next(err);
  }
};

exports.deleteCategory = async (req, res, next) => {
  try {
    const category = await Category.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!category) return res.status(404).json({ success: false, message: "Category not found" });
    res.json({ success: true, message: "Category deactivated" });
  } catch (err) {
    next(err);
  }
};

// ─── Category Tree ────────────────────────────────────────────────────────────
// Returns all active categories as a nested tree with medicine counts.
// Useful for sidebar navigation and category picker UIs.
exports.getCategoryTree = async (req, res, next) => {
  try {
    const [categories, medicineCounts] = await Promise.all([
      Category.find({ isActive: true })
        .sort({ order: 1, name: 1 })
        .select("name nameAr slug image parent isFeatured order")
        .lean(),
      Medicine.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
    ]);

    const countMap = Object.fromEntries(medicineCounts.map((c) => [c._id.toString(), c.count]));

    const catMap = {};
    const roots  = [];

    for (const cat of categories) {
      catMap[cat._id.toString()] = { ...cat, medicineCount: countMap[cat._id.toString()] || 0, children: [] };
    }

    for (const cat of Object.values(catMap)) {
      if (cat.parent) {
        const parentId = cat.parent.toString();
        if (catMap[parentId]) catMap[parentId].children.push(cat);
        // orphaned (parent deactivated) — include at root
        else roots.push(cat);
      } else {
        roots.push(cat);
      }
    }

    res.json({ success: true, tree: roots });
  } catch (err) {
    next(err);
  }
};
