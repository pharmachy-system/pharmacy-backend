const AppError = require("../utils/AppError");
const logger = require("../config/logger.config");
const { captureException } = require("../config/sentry.config");

const handleCastError = (err) =>
  new AppError(`Invalid ${err.path}: ${err.value}`, 400);

const handleDuplicateKey = (err) => {
  const field = Object.keys(err.keyValue || {})[0] || "field";
  const value = err.keyValue?.[field];
  return new AppError(
    `Duplicate value "${value}" for field "${field}". Please use a different value.`,
    409,
    null,
    "DUPLICATE_KEY"
  );
};

const handleValidationError = (err) => {
  const errors = Object.values(err.errors).map((e) => ({
    field: e.path,
    message: e.message,
  }));
  return new AppError(
    "Validation failed",
    422,
    "فشل التحقق من البيانات",
    "VALIDATION_ERROR",
    { errors }
  );
};

const errorHandler = (err, req, res, next) => {
  let error = err;

  // Mongoose / DB errors → operational AppErrors
  if (err.name === "CastError") error = handleCastError(err);
  else if (err.code === 11000) error = handleDuplicateKey(err);
  else if (err.name === "ValidationError") error = handleValidationError(err);
  else if (err.name === "JsonWebTokenError")
    error = new AppError("Invalid token. Please log in again.", 401, null, "INVALID_TOKEN");
  else if (err.name === "TokenExpiredError")
    error = new AppError("Token has expired. Please log in again.", 401, null, "TOKEN_EXPIRED");

  const statusCode = error.statusCode || 500;
  const isOperational = error.isOperational === true;

  // Log non-operational (programmer) errors as errors; operational ones as warnings
  if (isOperational) {
    logger.warn(`[${statusCode}] ${error.message}`, {
      url: req.originalUrl,
      method: req.method,
      code: error.code,
    });
  } else {
    logger.error(`[${statusCode}] ${error.message}`, {
      url: req.originalUrl,
      method: req.method,
      stack: error.stack,
    });
    // Forward unhandled programmer errors to Sentry (no-op when SENTRY_DSN is unset)
    captureException(err, {
      url:    req.originalUrl,
      method: req.method,
      userId: req.user?._id?.toString(),
    });
  }

  const body = {
    success: false,
    message: error.message || "Internal Server Error",
    ...(error.messageAr && { messageAr: error.messageAr }),
    ...(error.code && { code: error.code }),
    ...(error.meta?.errors && { errors: error.meta.errors }),
  };

  if (process.env.NODE_ENV === "development" && !isOperational) {
    body.stack = error.stack;
  }

  res.status(statusCode).json(body);
};

module.exports = errorHandler;
