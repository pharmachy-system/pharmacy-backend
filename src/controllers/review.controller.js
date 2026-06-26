const Review = require("../models/Review.model");
const Medicine = require("../models/Medicine.model");
const Order = require("../models/Order.model");

const recalculateRating = async (medicineId) => {
  const stats = await Review.aggregate([
    { $match: { medicine: medicineId, status: "approved" } },
    { $group: { _id: null, avgRating: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const { avgRating = 0, count = 0 } = stats[0] || {};
  await Medicine.findByIdAndUpdate(medicineId, {
    rating: Math.round(avgRating * 10) / 10,
    reviewCount: count,
  });
};

// ─── Get Reviews for a Medicine ───────────────────────────────────────────────
exports.getMedicineReviews = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = { medicine: req.params.medicineId, status: "approved" };
    if (req.query.rating) filter.rating = parseInt(req.query.rating);

    const sort = req.query.sort === "helpful" ? { helpfulCount: -1 } : { createdAt: -1 };

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate("user", "name avatar")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Review.countDocuments(filter),
    ]);

    // Rating distribution
    const medicineObjectId = require("mongoose").Types.ObjectId.isValid(req.params.medicineId)
      ? new (require("mongoose").Types.ObjectId)(req.params.medicineId)
      : null;
    const distribution = medicineObjectId
      ? await Review.aggregate([
          { $match: { medicine: medicineObjectId, status: "approved" } },
          { $group: { _id: "$rating", count: { $sum: 1 } } },
        ])
      : [];

    res.json({
      success: true,
      reviews,
      distribution: distribution.reduce((acc, d) => ({ ...acc, [d._id]: d.count }), {}),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Create Review ────────────────────────────────────────────────────────────
exports.createReview = async (req, res, next) => {
  try {
    const { medicineId } = req.params;
    const { rating, title, comment } = req.body;

    const medicine = await Medicine.findById(medicineId);
    if (!medicine) return res.status(404).json({ success: false, message: "Medicine not found" });

    const existing = await Review.findOne({ medicine: medicineId, user: req.user._id });
    if (existing) return res.status(400).json({ success: false, message: "You already reviewed this medicine" });

    // Check if user purchased this medicine
    const hasPurchased = await Order.findOne({
      user: req.user._id,
      "items.medicine": medicineId,
      status: "delivered",
    });

    const review = await Review.create({
      medicine: medicineId,
      user: req.user._id,
      rating,
      title,
      comment,
      isVerifiedPurchase: !!hasPurchased,
      status: "pending",
    });

    // Rating is recalculated only when review is approved (via moderateReview)

    res.status(201).json({ success: true, review, message: "Review submitted and pending moderation" });
  } catch (err) {
    next(err);
  }
};

// ─── Update Review ────────────────────────────────────────────────────────────
exports.updateReview = async (req, res, next) => {
  try {
    const review = await Review.findOne({ _id: req.params.id, user: req.user._id });
    if (!review) return res.status(404).json({ success: false, message: "Review not found" });

    const { rating, title, comment } = req.body;
    if (rating) review.rating = rating;
    if (title !== undefined) review.title = title;
    if (comment !== undefined) review.comment = comment;
    await review.save();

    await recalculateRating(review.medicine);
    res.json({ success: true, review });
  } catch (err) {
    next(err);
  }
};

// ─── Delete Review ────────────────────────────────────────────────────────────
exports.deleteReview = async (req, res, next) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role === "customer") filter.user = req.user._id;

    const review = await Review.findOneAndDelete(filter);
    if (!review) return res.status(404).json({ success: false, message: "Review not found" });

    await recalculateRating(review.medicine);
    res.json({ success: true, message: "Review deleted" });
  } catch (err) {
    next(err);
  }
};

// ─── Mark Helpful ─────────────────────────────────────────────────────────────
exports.markHelpful = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: "Review not found" });

    const userId = req.user._id.toString();
    const alreadyVoted = review.helpfulVotes.some((v) => v.toString() === userId);

    if (alreadyVoted) {
      review.helpfulVotes = review.helpfulVotes.filter((v) => v.toString() !== userId);
      review.helpfulCount = Math.max(0, review.helpfulCount - 1);
    } else {
      review.helpfulVotes.push(req.user._id);
      review.helpfulCount += 1;
    }
    await review.save();

    res.json({ success: true, helpfulCount: review.helpfulCount, voted: !alreadyVoted });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: Moderate Reviews ──────────────────────────────────────────────────
exports.getAllReviews = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.medicineId) filter.medicine = req.query.medicineId;

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate("user", "name email")
        .populate("medicine", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments(filter),
    ]);

    res.json({ success: true, reviews, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

exports.moderateReview = async (req, res, next) => {
  try {
    const { status, reply } = req.body;
    const update = { status };
    if (reply) {
      update.reply = reply;
      update.replyBy = req.user._id;
      update.repliedAt = new Date();
    }

    const review = await Review.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!review) return res.status(404).json({ success: false, message: "Review not found" });

    await recalculateRating(review.medicine);
    res.json({ success: true, review });
  } catch (err) {
    next(err);
  }
};
