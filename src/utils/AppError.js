/**
 * Operational error — thrown intentionally for expected failures.
 * Non-operational errors (programmer mistakes, uncaught exceptions) are
 * caught by the global error handler and returned as generic 500s.
 */
class AppError extends Error {
  /**
   * @param {string} message       Human-readable error message (English)
   * @param {number} statusCode    HTTP status code (4xx / 5xx)
   * @param {string} [messageAr]   Arabic translation (optional)
   * @param {string} [code]        Machine-readable error code  e.g. "ACCOUNT_LOCKED"
   * @param {object} [meta]        Extra data to expose in the response
   */
  constructor(message, statusCode, messageAr = null, code = null, meta = {}) {
    super(message);
    this.statusCode  = statusCode;
    this.status      = String(statusCode).startsWith("4") ? "fail" : "error";
    this.messageAr   = messageAr;
    this.code        = code;
    this.meta        = meta;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── Factory helpers ──────────────────────────────────────────────────────────

/** 400 Bad Request */
AppError.badRequest = (msg, ar, code, meta) => new AppError(msg, 400, ar, code, meta);

/** 401 Unauthorized */
AppError.unauthorized = (msg = "Not authenticated", ar = "غير مصرح") =>
  new AppError(msg, 401, ar, "UNAUTHORIZED");

/** 403 Forbidden */
AppError.forbidden = (msg = "Access denied", ar = "الوصول مرفوض") =>
  new AppError(msg, 403, ar, "FORBIDDEN");

/** 404 Not Found */
AppError.notFound = (resource = "Resource", ar = null) =>
  new AppError(
    `${resource} not found`,
    404,
    ar || `${resource} غير موجود`,
    "NOT_FOUND"
  );

/** 409 Conflict */
AppError.conflict = (msg, ar, code = "CONFLICT") => new AppError(msg, 409, ar, code);

/** 422 Unprocessable Entity */
AppError.validation = (msg, ar, meta) => new AppError(msg, 422, ar, "VALIDATION_ERROR", meta);

/** 429 Too Many Requests */
AppError.tooManyRequests = (msg = "Too many requests", ar = "طلبات كثيرة جداً") =>
  new AppError(msg, 429, ar, "RATE_LIMITED");

/** 500 Internal Server Error */
AppError.internal = (msg = "Internal server error", ar = "خطأ في الخادم") =>
  new AppError(msg, 500, ar, "INTERNAL_ERROR");

module.exports = AppError;
