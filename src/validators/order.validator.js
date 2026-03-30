const { body, param } = require("express-validator");

const createOrderValidator = [
  body("items")
    .isArray({ min: 1 }).withMessage("Order must contain at least one item"),
  body("items.*.medicine")
    .isMongoId().withMessage("Invalid medicine ID"),
  body("items.*.quantity")
    .isInt({ min: 1 }).withMessage("Item quantity must be at least 1"),
  body("paymentMethod")
    .optional()
    .isIn(["cash", "card", "insurance"]).withMessage("Payment method must be cash, card, or insurance"),
  body("prescription")
    .optional()
    .isMongoId().withMessage("Invalid prescription ID"),
];

const updateOrderStatusValidator = [
  param("id").isMongoId().withMessage("Invalid order ID"),
  body("status")
    .notEmpty().withMessage("Status is required")
    .isIn(["pending", "confirmed", "dispensed", "cancelled"]).withMessage("Invalid status"),
];

module.exports = { createOrderValidator, updateOrderStatusValidator };
