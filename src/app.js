/**
 * Express application factory.
 *
 * Applies middleware layers in order:
 *   Security (helmet, CORS, rate-limit)
 *   → NoSQL sanitisation
 *   → Logging (Morgan)
 *   → Body parsing
 *   → API docs (Swagger UI)
 *   → Routes
 *   → 404 handler
 *   → Global error handler
 */

// Third-party
const express    = require("express");
const helmet     = require("helmet");
const cors       = require("cors");
const swaggerUi  = require("swagger-ui-express");

// Config
const corsOptions    = require("./config/cors.config");
const swaggerSpec    = require("./config/swagger.config");
const logger         = require("./config/logger.config");

// Middleware
const { generalLimiter } = require("./middleware/rateLimiter.middleware");
const errorHandler       = require("./middleware/error.middleware");
const loggerMiddleware   = require("./middleware/logger.middleware");

const app = express();

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors(corsOptions));
app.use(generalLimiter);

// ── NoSQL injection sanitisation (Express 5 compatible) ──────────────────────
// Strips MongoDB operators ($, .) from user-supplied keys.
app.use((req, _res, next) => {
  if (req.body && typeof req.body === "object") {
    const sanitize = (obj) => {
      for (const key of Object.keys(obj)) {
        if (key.startsWith("$") || key.includes(".")) {
          delete obj[key];
        } else if (obj[key] && typeof obj[key] === "object") {
          sanitize(obj[key]);
        }
      }
    };
    sanitize(req.body);
  }
  next();
});

// ── Logging ───────────────────────────────────────────────────────────────────
app.use(loggerMiddleware);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── API docs ──────────────────────────────────────────────────────────────────
const swaggerUiOptions = {
  customSiteTitle: "Pharmacy API Docs",
  customCss: ".swagger-ui .topbar { background-color: #1a7f64; }",
};
app.use("/api/docs",  swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));
app.use("/api-docs",  swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));

// ── Routes ────────────────────────────────────────────────────────────────────
require("./routes")(app);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) =>
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` })
);

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
