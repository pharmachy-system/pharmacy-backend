const config    = require("./src/config/env");
const logger    = require("./src/config/logger.config");
const app       = require("./src/app");
const connectDB = require("./src/config/db");
const { startJobs, stopJobs } = require("./src/jobs");

// Warn about optional integrations that are not configured
const optionalIntegrations = {
  "SENTRY_DSN":             "Sentry error tracking disabled",
  "CLOUDINARY_CLOUD_NAME":  "Image upload (Cloudinary) not configured — uploads will fail",
  "SMTP_HOST":              "Email (SMTP) not configured — transactional emails disabled",
  "TWILIO_SID":             "SMS (Twilio) not configured — SMS notifications disabled",
  "FIREBASE_PROJECT_ID":    "Push notifications (Firebase) not configured",
  "ZATCA_VAT_NUMBER":       "ZATCA VAT number not set — using default placeholder",
  "STRIPE_SECRET_KEY":      "Stripe not configured — card payments disabled",
};
for (const [key, msg] of Object.entries(optionalIntegrations)) {
  if (!process.env[key]) logger.warn(`[CONFIG] ${msg} (set ${key} to enable)`);
}

const PORT = config.port || 5000;
let server;

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal) {
  logger.info(`[SERVER] ${signal} received — shutting down gracefully`);

  // 1. Stop accepting new connections
  server.close(async () => {
    logger.info("[SERVER] HTTP server closed");

    // 2. Stop scheduled jobs
    try { stopJobs(); } catch (_) {}

    // 3. Close DB connection
    try {
      const mongoose = require("mongoose");
      await mongoose.connection.close();
      logger.info("[SERVER] MongoDB connection closed");
    } catch (_) {}

    process.exit(0);
  });

  // Force-kill if shutdown takes more than 10 seconds
  setTimeout(() => {
    logger.error("[SERVER] Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  logger.error("[FATAL] Uncaught exception", { message: err.message, stack: err.stack });
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  logger.error("[FATAL] Unhandled rejection", { message: err?.message, stack: err?.stack });
  process.exit(1);
});

// ─── Boot sequence ────────────────────────────────────────────────────────────

connectDB()
  .then(() => {
    startJobs();

    server = app.listen(PORT, () => {
      logger.info(`[SERVER] Running on port ${PORT} (${process.env.NODE_ENV || "development"})`);
    });

    server.on("error", (err) => {
      logger.error("[SERVER] Listen error", { message: err.message });
      process.exit(1);
    });
  })
  .catch((err) => {
    logger.error("[BOOT] Failed to connect to database", { message: err.message });
    process.exit(1);
  });
