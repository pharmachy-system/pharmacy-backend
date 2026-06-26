const { protect }                          = require("./auth.middleware");
const authorize                            = require("./role.middleware");
const errorHandler                         = require("./errorHandler");
const { joiValidate, joiValidateMulti }    = require("./joiValidate.middleware");
const {
  apiLimiter, authLimiter, otpLimiter,
  passwordResetLimiter, paymentLimiter, strictLimiter,
  generalLimiter,
} = require("./rateLimiter");
const sanitize                             = require("./sanitize.middleware");
const loggerMiddleware                     = require("./logger.middleware");
const notFound                             = require("./notFound");

module.exports = {
  protect,
  authorize,
  errorHandler,
  joiValidate,
  joiValidateMulti,
  apiLimiter,
  authLimiter,
  otpLimiter,
  passwordResetLimiter,
  paymentLimiter,
  strictLimiter,
  generalLimiter,
  sanitize,
  loggerMiddleware,
  notFound,
};
