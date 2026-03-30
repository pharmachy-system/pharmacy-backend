const express = require("express");
const router = express.Router();
const {
  getWishlist, addToWishlist, removeFromWishlist, clearWishlist, moveToCart,
} = require("../controllers/wishlist.controller");
const { protect } = require("../middleware/auth.middleware");

router.use(protect);

router.get("/", getWishlist);
router.post("/", addToWishlist);
router.delete("/", clearWishlist);
router.post("/move-to-cart", moveToCart);
router.delete("/:medicineId", removeFromWishlist);

module.exports = router;
