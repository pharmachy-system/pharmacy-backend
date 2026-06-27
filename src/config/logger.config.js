const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const path = require("path");

const { combine, timestamp, errors, json, colorize, printf, splat } = winston.format;

const logDir = path.join(process.cwd(), "logs");

const consoleFormat = printf(({ level, message, timestamp, stack }) =>
  `${timestamp} [${level}]: ${stack || message}`
);

const isProduction = process.env.NODE_ENV === "production";
const isTest       = process.env.NODE_ENV === "test";

// Console transport:
//   development → human-readable colored format
//   production  → JSON (structured, parseable by CloudWatch / Papertrail / Datadog)
//   test        → silent (suppressed to keep test output clean)
const consoleTransport = isProduction
  ? new winston.transports.Console({
      format: combine(timestamp(), errors({ stack: true }), splat(), json()),
    })
  : new winston.transports.Console({
      silent: isTest,
      format: combine(colorize(), timestamp({ format: "HH:mm:ss" }), errors({ stack: true }), consoleFormat),
    });

// File transports — active in all environments; logs are mounted as a
// Docker volume in production and used for local debugging in development.
const fileTransports = [
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
];

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), errors({ stack: true }), splat(), json()),
  defaultMeta: { service: "pharmacy-api" },
  transports: [consoleTransport, ...fileTransports],
  exceptionHandlers: [
    new DailyRotateFile({ dirname: logDir, filename: "exceptions-%DATE%.log", datePattern: "YYYY-MM-DD" }),
  ],
  rejectionHandlers: [
    new DailyRotateFile({ dirname: logDir, filename: "rejections-%DATE%.log", datePattern: "YYYY-MM-DD" }),
  ],
});

// Morgan-compatible HTTP stream
logger.stream = {
  write: (message) => logger.http(message.trimEnd()),
};

module.exports = logger;
