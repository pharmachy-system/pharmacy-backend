/**
 * Middleware barrel export.
 * Import any middleware from one place:
 *   const { protect, authorize, authLimiter } = require("../middleware");
 */

const { protect }                          = require("./auth.middleware");
const authorize                            = require("./role.middleware");
const errorHandler                         = require("./error.middleware");
const validate                             = require("./validate.middleware");
const { joiValidate, joiValidateMulti }    = require("./joiValidate.middleware");
const { authLimiter, generalLimiter }      = require("./rateLimiter.middleware");
const loggerMiddleware                     = require("./logger.middleware");

module.exports = {
  // Authentication
  protect,

  // Role-based authorisation — usage: authorize("admin", "pharmacist")
  authorize,

  // Error handling (global, 4-arg middleware)
  errorHandler,

  // Request validation — express-validator style
  validate,

  // Joi validation
  joiValidate,
  joiValidateMulti,

  // Rate limiting
  authLimiter,
  generalLimiter,

  // HTTP request logging (Morgan)
  loggerMiddleware,
};
