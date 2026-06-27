const Wallet = require("../models/Wallet.model");
const AppError = require("../utils/AppError");

const getOrCreateWallet = async (userId) => {
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) wallet = await Wallet.create({ user: userId, balance: 0 });
  return wallet;
};

exports.getWallet = async (req, res, next) => {
  try {
    const wallet = await getOrCreateWallet(req.user._id);
    res.json({ success: true, balance: wallet.balance, isActive: wallet.isActive });
  } catch (err) {
    next(err);
  }
};

exports.getTransactions = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    // Use aggregation to avoid loading the full embedded array into memory
    const [result] = await Wallet.aggregate([
      { $match: { user: req.user._id } },
      {
        $project: {
          balance: 1,
          isActive: 1,
          total: { $size: { $ifNull: ["$transactions", []] } },
          transactions: {
            $slice: [
              { $sortArray: { input: { $ifNull: ["$transactions", []] }, sortBy: { createdAt: -1 } } },
              skip,
              limit,
            ],
          },
        },
      },
    ]);

    if (!result) {
      return res.json({
        success: true,
        balance: 0,
        transactions: [],
        pagination: { page, limit, total: 0, pages: 0 },
      });
    }

    res.json({
      success: true,
      balance: result.balance,
      transactions: result.transactions,
      pagination: { page, limit, total: result.total, pages: Math.ceil(result.total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// Admin: credit wallet (top-up, bonus, manual refund)
exports.creditWallet = async (req, res, next) => {
  try {
    const { userId, amount, description, reference } = req.body;
    if (!amount || amount <= 0) return next(AppError.badRequest("Amount must be greater than 0"));

    const amt = Number(amount);
    const targetUserId = userId || req.user._id;

    // Ensure wallet exists, then atomically increment balance
    await Wallet.findOneAndUpdate(
      { user: targetUserId },
      { $setOnInsert: { user: targetUserId, balance: 0, transactions: [] } },
      { upsert: true }
    );

    const updated = await Wallet.findOneAndUpdate(
      { user: targetUserId, isActive: true },
      { $inc: { balance: amt } },
      { new: true }
    );
    if (!updated) return next(AppError.badRequest("Wallet is inactive"));

    await Wallet.findByIdAndUpdate(updated._id, {
      $push: {
        transactions: {
          type: "credit",
          amount: amt,
          description: description || "Wallet credit",
          reference: reference || undefined,
          balanceAfter: updated.balance,
          createdAt: new Date(),
        },
      },
    });

    res.json({ success: true, balance: updated.balance, message: "Wallet credited" });
  } catch (err) {
    next(err);
  }
};

// User: debit wallet — atomic balance check prevents race condition double-spend
exports.debitWallet = async (req, res, next) => {
  try {
    const { amount, description, orderId } = req.body;
    if (!amount || amount <= 0) return next(AppError.badRequest("Amount must be greater than 0"));

    const amt = Number(amount);

    const updated = await Wallet.findOneAndUpdate(
      { user: req.user._id, balance: { $gte: amt }, isActive: true },
      { $inc: { balance: -amt } },
      { new: true }
    );
    if (!updated) return next(AppError.badRequest("Insufficient wallet balance"));

    await Wallet.findByIdAndUpdate(updated._id, {
      $push: {
        transactions: {
          type: "debit",
          amount: amt,
          description: description || "Payment",
          order: orderId || undefined,
          balanceAfter: updated.balance,
          createdAt: new Date(),
        },
      },
    });

    res.json({ success: true, balance: updated.balance });
  } catch (err) {
    next(err);
  }
};
