const { body, param } = require("express-validator");

const createPrescriptionValidator = [
  body("doctor")
    .trim()
    .notEmpty().withMessage("Doctor name is required"),
  body("medicines")
    .optional()
    .isArray().withMessage("Medicines must be an array"),
  body("medicines.*.name")
    .notEmpty().withMessage("Medicine name is required"),
  body("medicines.*.dosage")
    .optional()
    .isString(),
  body("image")
    .optional()
    .isURL().withMessage("Image must be a valid URL"),
];

const updatePrescriptionStatusValidator = [
  param("id").isMongoId().withMessage("Invalid prescription ID"),
  body("status")
    .notEmpty().withMessage("Status is required")
    .isIn(["pending", "approved", "rejected"]).withMessage("Status must be pending, approved, or rejected"),
  body("notes")
    .optional()
    .trim(),
];

module.exports = { createPrescriptionValidator, updatePrescriptionStatusValidator };
