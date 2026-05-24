const Wallet = require("../models/Wallet.model");

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
    const wallet = await getOrCreateWallet(req.user._id);
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const transactions = wallet.transactions
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(skip, skip + limit);

    res.json({
      success: true,
      balance: wallet.balance,
      transactions,
      pagination: { page, limit, total: wallet.transactions.length, pages: Math.ceil(wallet.transactions.length / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// Admin: Credit wallet (e.g., top-up, refund, bonus)
exports.creditWallet = async (req, res, next) => {
  try {
    const { userId, amount, description, reference } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: "Invalid amount" });

    const wallet = await getOrCreateWallet(userId || req.user._id);
    const newBalance = wallet.balance + amount;

    wallet.transactions.push({
      type: "credit",
      amount,
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

// Debit wallet (internal use)
exports.debitWallet = async (req, res, next) => {
  try {
    const { amount, description, orderId } = req.body;
    const wallet = await getOrCreateWallet(req.user._id);

    if (wallet.balance < amount) {
      return res.status(400).json({ success: false, message: "Insufficient wallet balance" });
    }

    const newBalance = wallet.balance - amount;
    wallet.transactions.push({
      type: "debit",
      amount,
      description: description || "Payment",
      order: orderId,
      balanceAfter: newBalance,
    });
    wallet.balance = newBalance;
    await wallet.save();

    res.json({ success: true, balance: wallet.balance });
  } catch (err) {
    next(err);
  }
};
