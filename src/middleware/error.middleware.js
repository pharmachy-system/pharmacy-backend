const AppError = require("../utils/AppError");
const logger   = require("../config/logger.config");

// ─── Error normalizers ────────────────────────────────────────────────────────

/** Mongoose: invalid ObjectId cast */
const handleCastError = (err) =>
  AppError.badRequest(`Invalid value for field '${err.path}': ${err.value}`);

/** Mongoose: unique index violation */
const handleDuplicateKey = (err) => {
  const field = Object.keys(err.keyValue || {})[0] || "field";
  const value = err.keyValue?.[field];
  return AppError.conflict(`${field} '${value}' is already in use`, "DUPLICATE_KEY");
};

/** Mongoose: schema validation failures */
const handleMongooseValidation = (err) => {
  const errors = Object.values(err.errors).map((e) => ({
    field:   e.path,
    message: e.message,
  }));
  return new AppError(
    Object.values(err.errors).map((e) => e.message).join(". "),
    400,
    "VALIDATION_ERROR",
    { errors }
  );
};

/** JWT: signature invalid */
const handleJwtInvalid = () =>
  AppError.unauthorized("Invalid token — please log in again");

/** JWT: expired */
const handleJwtExpired = () =>
  AppError.unauthorized("Your session has expired — please log in again");

/** Multer: file too large */
const handleMulterLimit = () =>
  AppError.badRequest("File size exceeds the allowed limit", "FILE_TOO_LARGE");

// ─── Response builder ─────────────────────────────────────────────────────────

const sendError = (err, req, res) => {
  const isDev = process.env.NODE_ENV === "development";

  // Operational: trusted, user-facing error
  if (err.isOperational) {
    const body = {
      success:   false,
      status:    err.status,
      message:   err.message,
      ...(err.code       && { code: err.code }),
      ...(err.meta && Object.keys(err.meta).length && { ...err.meta }),
    };
    if (isDev) body.stack = err.stack;
    return res.status(err.statusCode).json(body);
  }

  // Programming / unknown error — never leak details in production
  logger.error("UNHANDLED ERROR", {
    message: err.message,
    stack:   err.stack,
    url:     req.originalUrl,
    method:  req.method,
    ip:      req.ip,
  });

  if (isDev) {
    return res.status(500).json({
      success: false,
      status:  "error",
      message: err.message,
      stack:   err.stack,
    });
  }

  return res.status(500).json({
    success: false,
    status:  "error",
    message: "Something went wrong. Please try again later.",
  });
};

// ─── Global error handler (4-argument Express error middleware) ───────────────

const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  let error = err;

  // Normalize known error types into AppError instances
  if (err.name  === "CastError")              error = handleCastError(err);
  else if (err.code  === 11000)               error = handleDuplicateKey(err);
  else if (err.name  === "ValidationError")   error = handleMongooseValidation(err);
  else if (err.name  === "JsonWebTokenError") error = handleJwtInvalid();
  else if (err.name  === "TokenExpiredError") error = handleJwtExpired();
  else if (err.type  === "entity.too.large")  error = AppError.badRequest("Request body too large");
  else if (err.code  === "LIMIT_FILE_SIZE")   error = handleMulterLimit();
  else if (!err.isOperational) {
    // Ensure every error has the AppError shape
    error = new AppError(err.message || "Unexpected error", err.statusCode || 500);
    error.isOperational = false;
  }

  sendError(error, req, res);
};

module.exports = errorHandler;
