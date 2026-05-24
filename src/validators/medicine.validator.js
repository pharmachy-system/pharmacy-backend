const { body, param } = require("express-validator");

const createMedicineValidator = [
  body("name")
    .trim()
    .notEmpty().withMessage("Name is required")
    .isLength({ min: 2 }).withMessage("Name must be at least 2 characters"),
  body("price")
    .notEmpty().withMessage("Price is required")
    .isFloat({ min: 0 }).withMessage("Price must be >= 0"),
  body("quantity")
    .notEmpty().withMessage("Quantity is required")
    .isInt({ min: 0 }).withMessage("Quantity must be a non-negative integer"),
  body("category")
    .optional()
    .isMongoId().withMessage("Invalid category ID"),
  body("expiryDate")
    .optional()
    .isISO8601().withMessage("Invalid date format (use YYYY-MM-DD)")
    .custom((val) => {
      if (new Date(val) <= new Date()) throw new Error("Expiry date must be in the future");
      return true;
    }),
  body("lowStockThreshold")
    .optional()
    .isInt({ min: 0 }).withMessage("Low stock threshold must be a non-negative integer"),
];

const updateMedicineValidator = [
  body("name")
    .optional()
    .trim()
    .isLength({ min: 2 }).withMessage("Name must be at least 2 characters"),
  body("price")
    .optional()
    .isFloat({ min: 0 }).withMessage("Price must be >= 0"),
  body("quantity")
    .optional()
    .isInt({ min: 0 }).withMessage("Quantity must be a non-negative integer"),
  body("category")
    .optional()
    .isMongoId().withMessage("Invalid category ID"),
  body("expiryDate")
    .optional()
    .isISO8601().withMessage("Invalid date format (use YYYY-MM-DD)"),
  body("lowStockThreshold")
    .optional()
    .isInt({ min: 0 }).withMessage("Low stock threshold must be a non-negative integer"),
];

const idParamValidator = [
  param("id").isMongoId().withMessage("Invalid ID format"),
];

module.exports = { createMedicineValidator, updateMedicineValidator, idParamValidator };
