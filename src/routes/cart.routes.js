const express = require("express");
const router = express.Router();
const {
  getCart, addToCart, updateCartItem, removeFromCart, clearCart, applyCoupon, removeCoupon,
} = require("../controllers/cart.controller");
const { protect } = require("../middlewares/auth.middleware");
const { joiValidate } = require("../middlewares/joiValidate.middleware");
const { schemas }     = require("../validators/joi.validators");

router.use(protect); // All cart routes require authentication

router.get("/", getCart);
router.post("/items",          joiValidate(schemas.cart.addItem),    addToCart);
router.put("/items/:itemId",   joiValidate(schemas.cart.updateItem), updateCartItem);
router.delete("/items/:itemId", removeFromCart);
router.delete("/", clearCart);
router.post("/coupon",  joiValidate(schemas.cart.applyCoupon), applyCoupon);
router.delete("/coupon", removeCoupon);

module.exports = router;
