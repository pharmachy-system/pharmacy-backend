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

    const wallet = await getOrCreateWallet(userId || req.user._id);
    const newBalance = wallet.balance + Number(amount);

    wallet.transactions.push({
      type: "credit",
      amount: Number(amount),
      description: description || "Wallet credit",
      reference,
      balanceAfter: newBalance,
    });
    wallet.balance = newBalance;
    await wallet.save();

    res.json({ success: true, balance: wallet.balance, message: "Wallet credited" });
  } catch (err) {
    next(err);
  }
};

// User: debit wallet
exports.debitWallet = async (req, res, next) => {
  try {
    const { amount, description, orderId } = req.body;
    if (!amount || amount <= 0) return next(AppError.badRequest("Amount must be greater than 0"));

    const wallet = await getOrCreateWallet(req.user._id);
    if (wallet.balance < amount) {
      return next(AppError.badRequest("Insufficient wallet balance"));
    }

    const newBalance = wallet.balance - Number(amount);
    wallet.transactions.push({
      type: "debit",
      amount: Number(amount),
      description: description || "Payment",
      order: orderId || undefined,
      balanceAfter: newBalance,
    });
    wallet.balance = newBalance;
    await wallet.save();

    res.json({ success: true, balance: wallet.balance });
  } catch (err) {
    next(err);
  }
};
