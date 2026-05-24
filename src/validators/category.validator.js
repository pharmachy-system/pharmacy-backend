const { body, param } = require("express-validator");

const createCategoryValidator = [
  body("name")
    .trim()
    .notEmpty().withMessage("Name is required")
    .isLength({ min: 2, max: 50 }).withMessage("Name must be 2–50 characters"),
  body("description")
    .optional()
    .trim(),
];

const updateCategoryValidator = [
  body("name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage("Name must be 2–50 characters"),
  body("description")
    .optional()
    .trim(),
];

const idParamValidator = [
  param("id").isMongoId().withMessage("Invalid ID format"),
];

module.exports = { createCategoryValidator, updateCategoryValidator, idParamValidator };
