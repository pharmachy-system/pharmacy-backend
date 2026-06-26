const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const swaggerUi = require('swagger-ui-express');

// Utils
const logger = require('./utils/logger');
const { apiLimiter } = require('./middlewares/rateLimiter');
const sanitize = require('./middlewares/sanitize.middleware');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');

// Config
const swaggerSpec = require('./config/swagger.config');

const app = express();

// Attach a unique request ID to every request for log correlation
app.use((req, _res, next) => {
  req.id = crypto.randomUUID();
  next();
});

// Security headers
app.use(helmet());

// CORS — supports comma-separated list in CORS_ORIGIN env var
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, mobile apps, Postman)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  optionsSuccessStatus: 200,
}));

// Logging
app.use(morgan('combined', { stream: logger.stream }));

// Compression
app.use(compression());

// Cookie parser
app.use(cookieParser());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// NoSQL injection + XSS sanitization (Express 5 compatible — body/params only)
app.use(sanitize);

// Rate limiting
app.use('/api', apiLimiter);

// API documentation
const swaggerUiOptions = {
  customSiteTitle: 'Pharmacy API Docs',
  customCss: '.swagger-ui .topbar { background-color: #1a7f64; }'
};
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));

// Routes
require('./routes')(app);



// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

module.exports = app;