const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
// const mongoSanitize = require('express-mongo-sanitize'); // disabled - incompatible with Express 5
const swaggerUi = require('swagger-ui-express');

// Utils
const logger = require('./utils/logger');
const { apiLimiter } = require('./middlewares/rateLimiter');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');

// Config
const swaggerSpec = require('./config/swagger.config');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200
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

// NoSQL injection sanitization
// app.use(mongoSanitize()); // disabled - incompatible with Express 5

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