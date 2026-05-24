/**
 * Validators barrel export.
 *
 * Two validation systems are available:
 *
 * 1. Joi (preferred for new routes) — bilingual Arabic/English error messages.
 *    Use with joiValidate() middleware from src/middleware/joiValidate.middleware.js
 *
 *    const { schemas } = require("../validators");
 *    router.post("/register", joiValidate(schemas.auth.register), register);
 *
 * 2. express-validator (legacy routes) — kept for backwards compatibility.
 *    Use with the validate() middleware from src/middleware/validate.middleware.js
 *
 *    const { registerValidator } = require("../validators");
 *    router.post("/register", registerValidator, validate, register);
 */

// ── Joi schemas (all routes) ──────────────────────────────────────────────────
const { schemas } = require("./joi.validators");

// ── express-validator chains (legacy) ────────────────────────────────────────
const {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
} = require("./auth.validator");

const {
  createMedicineValidator,
  updateMedicineValidator,
  idParamValidator,
} = require("./medicine.validator");

const {
  createCategoryValidator,
  updateCategoryValidator,
} = require("./category.validator");

const {
  createOrderValidator,
  updateOrderStatusValidator,
} = require("./order.validator");

const {
  createPrescriptionValidator,
  updatePrescriptionStatusValidator,
} = require("./prescription.validator");

module.exports = {
  // Joi
  schemas,

  // express-validator — auth
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,

  // express-validator — medicine
  createMedicineValidator,
  updateMedicineValidator,
  idParamValidator,

  // express-validator — category
  createCategoryValidator,
  updateCategoryValidator,

  // express-validator — order
  createOrderValidator,
  updateOrderStatusValidator,

  // express-validator — prescription
  createPrescriptionValidator,
  updatePrescriptionStatusValidator,
};
