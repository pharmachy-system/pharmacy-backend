const mongoose = require("mongoose");
const logger = require("./config/logger.config");

const connectDB = async () => {
  const conn = await mongoose.connect(process.env.MONGO_URI, {
    maxPoolSize: 10,
  });
  logger.info(`MongoDB Connected: ${conn.connection.host}`);
};

mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
mongoose.connection.on("error", (err) => logger.error(`MongoDB error: ${err.message}`));

module.exports = connectDB;
