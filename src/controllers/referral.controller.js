const User = require("../models/User.model");
const LoyaltyTransaction = require("../models/LoyaltyTransaction.model");
const Order = require("../models/Order.model");
const { createNotification } = require("../utils/notification.util");

// Points awarded for referrals
const REFERRER_BONUS = 50;   // points given to the person who referred
const REFEREE_BONUS  = 25;   // points given to the new user on first order

// ─── Get My Referral Info ─────────────────────────────────────────────────────
exports.getMyReferral = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("referralCode loyaltyPoints referredBy");

    // Count how many users this person has referred
    const referredCount = await User.countDocuments({ referredBy: req.user._id });

    // Count how many of those referred users have placed at least one order
    const referredUsers = await User.find({ referredBy: req.user._id }).select("_id");
    const referredIds = referredUsers.map((u) => u._id);
    const convertedCount = await Order.distinct("user", {
      user: { $in: referredIds },
      status: { $nin: ["cancelled", "refunded"] },
    }).then((ids) => ids.length);

    // Total loyalty points earned via referrals
    const referralEarnings = await LoyaltyTransaction.aggregate([
      { $match: { user: req.user._id, type: "referral" } },
      { $group: { _id: null, total: { $sum: "$points" } } },
    ]);

    const shareLink = `${process.env.CLIENT_URL}/register?ref=${user.referralCode}`;

    res.json({
      success: true,
      referralCode: user.referralCode,
      shareLink,
      stats: {
        referredCount,
        convertedCount,
        pointsEarned: referralEarnings[0]?.total || 0,
        pendingBonus: (referredCount - convertedCount) * REFERRER_BONUS,
      },
      rewards: {
        youEarnPerReferral: REFERRER_BONUS,
        friendEarnsOnFirstOrder: REFEREE_BONUS,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Get Referred Users List ──────────────────────────────────────────────────
exports.getReferredUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find({ referredBy: req.user._id })
        .select("name email createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments({ referredBy: req.user._id }),
    ]);

    // Annotate each with whether they've placed an order
    const userIds = users.map((u) => u._id);
    const orderedUserIds = await Order.distinct("user", {
      user: { $in: userIds },
      status: { $nin: ["cancelled", "refunded"] },
    });
    const orderedSet = new Set(orderedUserIds.map(String));

    const annotated = users.map((u) => ({
      ...u.toObject(),
      hasOrdered: orderedSet.has(String(u._id)),
    }));

    res.json({
      success: true,
      users: annotated,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Validate Referral Code ───────────────────────────────────────────────────
exports.validateReferralCode = async (req, res, next) => {
  try {
    const { code } = req.params;
    const referrer = await User.findOne({ referralCode: code.toUpperCase() }).select("name referralCode");
    if (!referrer) {
      return res.status(404).json({ success: false, message: "Invalid referral code" });
    }
    res.json({
      success: true,
      valid: true,
      referrer: { name: referrer.name },
      bonus: `You'll earn ${REFEREE_BONUS} loyalty points on your first order!`,
    });
  } catch (err) {
    next(err);
  }
};

// ─── Process Referral Reward (called internally after first order) ────────────
// This is exported so order.controller.js can call it
exports.processReferralReward = async (userId, orderId) => {
  try {
    // Atomically claim the reward — prevents double-award from concurrent requests
    const user = await User.findOneAndUpdate(
      { _id: userId, referredBy: { $exists: true, $ne: null }, referralRewardClaimed: false },
      { $set: { referralRewardClaimed: true } },
      { new: false } // return the document BEFORE the update (to confirm we claimed it)
    ).select("name referredBy loyaltyPoints");

    // null means either no referral, or already claimed — nothing to do
    if (!user) return;

    const orderCount = await Order.countDocuments({
      user: userId,
      status: { $nin: ["cancelled", "refunded"] },
    });
    if (orderCount !== 1) {
      // Not the first completed order — roll back the claim flag
      await User.findByIdAndUpdate(userId, { referralRewardClaimed: false });
      return;
    }

    const referrer = await User.findById(user.referredBy);
    if (!referrer) return;

    // Reward the new user (referee) — use atomic update, then read back new balance
    const updatedReferee = await User.findByIdAndUpdate(
      userId,
      { $inc: { loyaltyPoints: REFEREE_BONUS } },
      { new: true }
    );
    await LoyaltyTransaction.create({
      user: userId,
      type: "referral",
      points: REFEREE_BONUS,
      balance: updatedReferee.loyaltyPoints,
      description: `Welcome bonus – referred by ${referrer.name}`,
      order: orderId,
    });

    // Reward the referrer atomically
    const updatedReferrer = await User.findByIdAndUpdate(
      referrer._id,
      { $inc: { loyaltyPoints: REFERRER_BONUS } },
      { new: true }
    );
    await LoyaltyTransaction.create({
      user: referrer._id,
      type: "referral",
      points: REFERRER_BONUS,
      balance: updatedReferrer.loyaltyPoints,
      description: `Referral bonus – ${user.name || "A friend"} placed their first order`,
      order: orderId,
    });

    // Notify referrer
    await createNotification({
      userId: referrer._id,
      type: "promotion",
      title: "Referral Reward!",
      body: `You earned ${REFERRER_BONUS} points because your friend placed their first order.`,
      data: { points: REFERRER_BONUS },
    });
  } catch (err) {
    // Non-blocking – referral reward failure should not break the order
    const logger = require("../config/logger.config");
    logger.error("processReferralReward error:", err);
  }
};

// ─── Admin: Referral Stats ────────────────────────────────────────────────────
exports.getReferralStats = async (req, res, next) => {
  try {
    const [totalReferrals, totalRewards, topReferrers] = await Promise.all([
      User.countDocuments({ referredBy: { $exists: true, $ne: null } }),
      LoyaltyTransaction.aggregate([
        { $match: { type: "referral" } },
        { $group: { _id: null, totalPoints: { $sum: "$points" }, count: { $sum: 1 } } },
      ]),
      User.aggregate([
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "referredBy",
            as: "referred",
          },
        },
        { $addFields: { referralCount: { $size: "$referred" } } },
        { $match: { referralCount: { $gt: 0 } } },
        { $sort: { referralCount: -1 } },
        { $limit: 10 },
        { $project: { name: 1, email: 1, referralCode: 1, referralCount: 1 } },
      ]),
    ]);

    res.json({
      success: true,
      stats: {
        totalReferrals,
        totalRewardsIssued: totalRewards[0]?.totalPoints || 0,
        totalRewardTransactions: totalRewards[0]?.count || 0,
      },
      topReferrers,
    });
  } catch (err) {
    next(err);
  }
};
