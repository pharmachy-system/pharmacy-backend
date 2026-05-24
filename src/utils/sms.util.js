/**
 * SMS Utility — Twilio integration with development fallback.
 *
 * When TWILIO_SID + TWILIO_TOKEN + TWILIO_PHONE are set → sends real SMS via Twilio.
 * In development without those vars      → logs the message via Winston.
 * In production without those vars       → throws an error (misconfiguration).
 *
 * Twilio is lazy-loaded so the app starts even if the package is not installed.
 */

const logger = require("../config/logger.config");

/**
 * Send an SMS message.
 * @param {object} opts
 * @param {string} opts.to    Recipient phone number in E.164 format (e.g. +966501234567)
 * @param {string} opts.body  Message text
 */
const sendSMS = async ({ to, body }) => {
  const { TWILIO_SID, TWILIO_TOKEN, TWILIO_PHONE } = process.env;

  if (TWILIO_SID && TWILIO_TOKEN && TWILIO_PHONE) {
    // Lazy-load so the app starts even without twilio installed
    const twilio = require("twilio");
    const client = twilio(TWILIO_SID, TWILIO_TOKEN);
    await client.messages.create({ body, from: TWILIO_PHONE, to });
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SMS service not configured. Set TWILIO_SID, TWILIO_TOKEN, and TWILIO_PHONE.");
  }

  // Development fallback — log instead of sending
  logger.info(`📱 [SMS DEV] To: ${to} | ${body}`);
};

module.exports = sendSMS;
