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



// TEMP: import products
app.get('/api/clear-medicines-temp', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const Medicine = mongoose.connection.models['Medicine'] || require('./models/medicine.model');
    const result = await Medicine.deleteMany({});
    res.json({ message: 'Cleared', deleted: result.deletedCount });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/import-products-temp', async (req, res) => {
  try {
    const fs = require('fs');
    const Medicine = mongoose.connection.models['Medicine'] || require('./models/Medicine.model');
    const raw = JSON.parse(fs.readFileSync('/Users/AmalAlSari/Downloads/pharmacy-backend-main/products-import.json', 'utf8'));
    const data = raw.filter(p => p.name && p.price > 0 && p.price < 100000);
    const docs = data.map(p => ({
      name: p.name,
      price: p.price,
      stock: Math.max(0, Math.round(p.quantity)),
      unit: p.unit,
      slug: p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).substr(2,5)
    }));
    await Medicine.insertMany(docs, { ordered: false });
    res.json({ message: 'Done', imported: docs.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

module.exports = app;