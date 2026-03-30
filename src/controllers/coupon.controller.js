const Coupon = require("../models/Coupon.model");

exports.getAllCoupons = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === "true";
    if (req.query.type) filter.type = req.query.type;

    const [coupons, total] = await Promise.all([
      Coupon.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Coupon.countDocuments(filter),
    ]);

    res.json({ success: true, coupons, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

exports.getCouponById = async (req, res, next) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });
    res.json({ success: true, coupon });
  } catch (err) {
    next(err);
  }
};

exports.validateCoupon = async (req, res, next) => {
  try {
    const { code, orderAmount } = req.body;
    const coupon = await Coupon.findOne({ code: code.toUpperCase() });

    if (!coupon || !coupon.isValid()) {
      return res.status(400).json({ success: false, message: "Invalid or expired coupon" });
    }

    const userUsage = coupon.usedBy.filter((id) => id.toString() === req.user._id.toString()).length;
    if (userUsage >= coupon.perUserLimit) {
      return res.status(400).json({ success: false, message: "You have already used this coupon" });
    }

    if (orderAmount && orderAmount < coupon.minOrderAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum order amount is ${coupon.minOrderAmount} SAR`,
      });
    }

    let discount = 0;
    if (orderAmount) {
      discount = coupon.type === "percentage" ? (orderAmount * coupon.value) / 100 : coupon.value;
      if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
    }

    res.json({
      success: true,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        discount: Math.round(discount * 100) / 100,
        description: coupon.description,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.createCoupon = async (req, res, next) => {
  try {
    const coupon = await Coupon.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ success: true, coupon });
  } catch (err) {
    next(err);
  }
};

exports.updateCoupon = async (req, res, next) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });
    res.json({ success: true, coupon });
  } catch (err) {
    next(err);
  }
};

exports.deleteCoupon = async (req, res, next) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });
    res.json({ success: true, message: "Coupon deactivated" });
  } catch (err) {
    next(err);
  }
};
