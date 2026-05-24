/**
 * Models barrel export.
 * Import any model from one place:
 *   const { User, Order, Medicine } = require("../models");
 */

module.exports = {
  Article:            require("./Article.model"),
  Brand:              require("./Brand.model"),
  Cart:               require("./Cart.model"),
  Category:           require("./Category.model"),
  Coupon:             require("./Coupon.model"),
  DeliveryZone:       require("./DeliveryZone.model"),
  FlashSale:          require("./FlashSale.model"),
  GuestSession:       require("./GuestSession.model"),
  LoyaltyTransaction: require("./LoyaltyTransaction.model"),
  Medicine:           require("./Medicine.model"),
  Notification:       require("./Notification.model"),
  Order:              require("./Order.model"),
  Payment:            require("./Payment.model"),
  Prescription:       require("./Prescription.model"),
  Review:             require("./Review.model"),
  Session:            require("./Session.model"),
  User:               require("./User.model"),
  Wallet:             require("./Wallet.model"),
  Wishlist:           require("./Wishlist.model"),
};
