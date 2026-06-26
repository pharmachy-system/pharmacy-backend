const rateLimit = require("express-rate-limit");

const json = (message) => ({ success: false, message });

// Skip all IP-based limiters in test mode — tests share one IP and would
// exhaust windows after a handful of requests. Controller-level limits
// (per-user OTP resend, login lockout) are never skipped.
const skipInTest = () => process.env.NODE_ENV === "test";

// General API limiter — all /api routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: json("Too many requests, please try again later"),
});

// Auth limiter — register, login, social login
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: json("Too many authentication attempts, please try again after 15 minutes"),
});

// OTP limiter — send/resend OTP (stricter: 5 per 15 min)
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: json("Too many OTP requests, please try again after 15 minutes"),
});

// Password reset limiter — forgot-password, reset-password (3 per hour)
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: json("Too many password reset requests, please try again after 1 hour"),
});

// Payment limiter — create intents, refunds (30 per 15 min)
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: json("Too many payment requests, please slow down"),
});

// Strict limiter — admin-only sensitive actions (10 per 15 min)
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: json("Rate limit exceeded for this action"),
});

module.exports = {
  apiLimiter,
  authLimiter,
  otpLimiter,
  passwordResetLimiter,
  paymentLimiter,
  strictLimiter,
  // alias kept for any legacy import
  generalLimiter: apiLimiter,
};
