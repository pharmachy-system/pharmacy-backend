/**
 * Operational error — thrown intentionally for expected failures.
 * Non-operational errors (programmer mistakes, uncaught exceptions) are
 * caught by the global error handler and returned as generic 500s.
 */
class AppError extends Error {
  /**
   * @param {string} message       Human-readable error message
   * @param {number} statusCode    HTTP status code (4xx / 5xx)
   * @param {string} [code]        Machine-readable error code  e.g. "ACCOUNT_LOCKED"
   * @param {object} [meta]        Extra data to expose in the response
   */
  constructor(message, statusCode, code = null, meta = {}) {
    super(message);
    this.statusCode  = statusCode;
    this.status      = String(statusCode).startsWith("4") ? "fail" : "error";
    this.code        = code;
    this.meta        = meta;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── Factory helpers ──────────────────────────────────────────────────────────

/** 400 Bad Request */
AppError.badRequest = (msg, code, meta) => new AppError(msg, 400, code, meta);

/** 401 Unauthorized */
AppError.unauthorized = (msg = "Not authenticated") =>
  new AppError(msg, 401, "UNAUTHORIZED");

/** 403 Forbidden */
AppError.forbidden = (msg = "Access denied") =>
  new AppError(msg, 403, "FORBIDDEN");

/** 404 Not Found */
AppError.notFound = (resource = "Resource") =>
  new AppError(`${resource} not found`, 404, "NOT_FOUND");

/** 409 Conflict */
AppError.conflict = (msg, code = "CONFLICT") => new AppError(msg, 409, code);

/** 422 Unprocessable Entity */
AppError.validation = (msg, meta) => new AppError(msg, 422, "VALIDATION_ERROR", meta);

/** 429 Too Many Requests */
AppError.tooManyRequests = (msg = "Too many requests") =>
  new AppError(msg, 429, "RATE_LIMITED");

/** 500 Internal Server Error */
AppError.internal = (msg = "Internal server error") =>
  new AppError(msg, 500, "INTERNAL_ERROR");

module.exports = AppError;
