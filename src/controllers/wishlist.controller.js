const Wishlist = require("../models/Wishlist.model");
const Medicine = require("../models/Medicine.model");

exports.getWishlist = async (req, res, next) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id }).populate(
      "items.medicine",
      "name images price finalPrice discount stock requiresPrescription isActive rating"
    );

    if (!wishlist) return res.json({ success: true, items: [], count: 0 });

    // Filter inactive
    const activeItems = wishlist.items.filter((i) => i.medicine && i.medicine.isActive);
    res.json({ success: true, items: activeItems, count: activeItems.length });
  } catch (err) {
    next(err);
  }
};

exports.addToWishlist = async (req, res, next) => {
  try {
    const { medicineId } = req.body;

    const medicine = await Medicine.findOne({ _id: medicineId, isActive: true });
    if (!medicine) return res.status(404).json({ success: false, message: "Medicine not found" });

    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) wishlist = await Wishlist.create({ user: req.user._id, items: [] });

    const exists = wishlist.items.some((i) => i.medicine.toString() === medicineId);
    if (exists) return res.status(400).json({ success: false, message: "Already in wishlist" });

    wishlist.items.push({ medicine: medicineId });
    await wishlist.save();

    res.status(201).json({ success: true, message: "Added to wishlist", count: wishlist.items.length });
  } catch (err) {
    next(err);
  }
};

exports.removeFromWishlist = async (req, res, next) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) return res.status(404).json({ success: false, message: "Wishlist not found" });

    const before = wishlist.items.length;
    wishlist.items = wishlist.items.filter((i) => i.medicine.toString() !== req.params.medicineId);

    if (wishlist.items.length === before)
      return res.status(404).json({ success: false, message: "Item not found in wishlist" });

    await wishlist.save();
    res.json({ success: true, message: "Removed from wishlist", count: wishlist.items.length });
  } catch (err) {
    next(err);
  }
};

exports.clearWishlist = async (req, res, next) => {
  try {
    await Wishlist.findOneAndUpdate({ user: req.user._id }, { items: [] });
    res.json({ success: true, message: "Wishlist cleared" });
  } catch (err) {
    next(err);
  }
};

exports.moveToCart = async (req, res, next) => {
  try {
    const { medicineId } = req.body;
    const Cart = require("../models/Cart.model");

    const medicine = await Medicine.findOne({ _id: medicineId, isActive: true });
    if (!medicine) return res.status(404).json({ success: false, message: "Medicine not found" });
    if (medicine.stock < 1)
      return res.status(400).json({ success: false, message: "Medicine is out of stock" });

    // Add to cart
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) cart = await Cart.create({ user: req.user._id, items: [] });

    const existing = cart.items.find((i) => i.medicine.toString() === medicineId);
    if (existing) {
      existing.quantity += 1;
    } else {
      cart.items.push({ medicine: medicine._id, quantity: 1, price: medicine.finalPrice ?? medicine.price, name: medicine.name });
    }
    await cart.save();

    // Remove from wishlist
    await Wishlist.findOneAndUpdate({ user: req.user._id }, { $pull: { items: { medicine: medicineId } } });

    res.json({ success: true, message: "Moved to cart" });
  } catch (err) {
    next(err);
  }
};
