const express = require("express");
const router = express.Router();
const {
  getCart, addToCart, updateCartItem, removeFromCart, clearCart, applyCoupon, removeCoupon,
} = require("../controllers/cart.controller");
const { protect } = require("../middlewares/auth.middleware");

router.use(protect); // All cart routes require authentication

router.get("/", getCart);
router.post("/items", addToCart);
router.put("/items/:itemId", updateCartItem);
router.delete("/items/:itemId", removeFromCart);
router.delete("/", clearCart);
router.post("/coupon", applyCoupon);
router.delete("/coupon", removeCoupon);

module.exports = router;
