const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const path = require("path");

const { combine, timestamp, errors, json, colorize, printf, splat } = winston.format;

const logDir = path.join(process.cwd(), "logs");

const consoleFormat = printf(({ level, message, timestamp, stack }) =>
  `${timestamp} [${level}]: ${stack || message}`
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), errors({ stack: true }), splat(), json()),
  defaultMeta: { service: "pharmacy-api" },
  transports: [
    new DailyRotateFile({
      dirname: logDir,
      filename: "error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      level: "error",
      maxFiles: "30d",
      zippedArchive: true,
    }),
    new DailyRotateFile({
      dirname: logDir,
      filename: "combined-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxFiles: "14d",
      zippedArchive: true,
    }),
  ],
  exceptionHandlers: [
    new DailyRotateFile({ dirname: logDir, filename: "exceptions-%DATE%.log", datePattern: "YYYY-MM-DD" }),
  ],
  rejectionHandlers: [
    new DailyRotateFile({ dirname: logDir, filename: "rejections-%DATE%.log", datePattern: "YYYY-MM-DD" }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: "HH:mm:ss" }), errors({ stack: true }), consoleFormat),
    })
  );
}

// Morgan-compatible HTTP stream
logger.stream = {
  write: (message) => logger.http(message.trimEnd()),
};

module.exports = logger;
