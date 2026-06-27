/**
 * Sentry error tracking — optional.
 *
 * Only activates when SENTRY_DSN is set in the environment.
 * The app starts and runs normally without it.
 *
 * Setup:
 *   1. npm install @sentry/node
 *   2. Set SENTRY_DSN=https://... in your environment
 *   3. Call initSentry(app) in app.js AFTER routes, BEFORE the error handler
 */

let _sentry = null;

/**
 * Initialize Sentry and attach the Express error handler.
 * Must be called AFTER all routes are registered.
 *
 * @param {import("express").Application} app
 */
function initSentry(app) {
  if (!process.env.SENTRY_DSN) return;
  if (process.env.NODE_ENV === "test") return; // never capture test errors

  try {
    const Sentry = require("@sentry/node");

    Sentry.init({
      dsn:   process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || "development",

      // Capture 10% of transactions in production for performance monitoring.
      // Use 1.0 in staging to see all transactions.
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

      // Ignore noisy / expected errors
      ignoreErrors: [
        /CORS:/,
        /Not authorized/,
        /Invalid token/,
        /Token has expired/,
        /Too many requests/,
      ],
    });

    // Attach the Express error handler — Sentry captures unhandled errors
    // that reach Express's error middleware chain.
    Sentry.setupExpressErrorHandler(app);

    _sentry = Sentry;
  } catch (err) {
    // @sentry/node is not installed — skip silently
    if (err.code !== "MODULE_NOT_FOUND") {
      console.warn("[Sentry] Failed to initialize:", err.message);
    }
  }
}

/**
 * Manually capture an exception (call from the global error handler).
 *
 * @param {Error} err
 * @param {{ url?: string, method?: string, userId?: string }} [context]
 */
function captureException(err, context = {}) {
  if (!_sentry) return;
  _sentry.withScope((scope) => {
    if (context.url)    scope.setTag("url",    context.url);
    if (context.method) scope.setTag("method", context.method);
    if (context.userId) scope.setUser({ id: context.userId });
    _sentry.captureException(err);
  });
}

module.exports = { initSentry, captureException };
