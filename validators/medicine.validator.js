const { body, param } = require("express-validator");

exports.createMedicineValidator = [
  body("name")
    .trim()
    .notEmpty().withMessage("name is required")
    .isLength({ min: 2 }).withMessage("name must be at least 2 chars"),

  body("price")
    .notEmpty().withMessage("price is required")
    .isFloat({ gt: 0 }).withMessage("price must be a number > 0"),

  body("stock")
    .notEmpty().withMessage("stock is required")
    .isInt({ min: 0 }).withMessage("stock must be an integer >= 0"),
];

exports.updateMedicineValidator = [
  body("name")
    .optional()
    .trim()
    .notEmpty().withMessage("name cannot be empty")
    .isLength({ min: 2 }).withMessage("name must be at least 2 chars"),

  body("price")
    .optional()
    .isFloat({ gt: 0 }).withMessage("price must be a number > 0"),

  body("stock")
    .optional()
    .isInt({ min: 0 }).withMessage("stock must be an integer >= 0"),
];

exports.idParamValidator = [
  param("id")
    .isMongoId().withMessage("Invalid ID"),
];
