const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  let retries = 0;
  const maxRetries = 10;
  const retryDelay = 5000; // 5 seconds

  const connect = async () => {
    try {
      const conn = await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        tls: true,
        tlsAllowInvalidCertificates: true,
      });

      logger.info(`MongoDB Connected: ${conn.connection.host}`);
      return conn;
    } catch (error) {
      retries++;
      logger.error(`MongoDB connection attempt ${retries} failed: ${error.message}`);

      if (retries >= maxRetries) {
        logger.error('Maximum retries reached. Exiting...');
        process.exit(1);
      }

      logger.info(`Retrying in ${retryDelay / 1000} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      return connect();
    }
  };

  // Event listeners
  mongoose.connection.on('connected', () => {
    logger.info('Mongoose connected to MongoDB');
  });

  mongoose.connection.on('error', (err) => {
    logger.error(`Mongoose connection error: ${err}`);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('Mongoose disconnected from MongoDB');
  });

  return connect();
};

module.exports = connectDB;