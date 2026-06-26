const express = require("express");
const router  = express.Router();

// ── Controllers ───────────────────────────────────────────────────────────────
const {
  register, login, refreshToken, logout, logoutAll,
  getMe, checkSession,
  verifyEmail, resendOTP, forgotPassword, resetPassword, changePassword,
  socialLogin,
} = require("../controllers/auth.controller");

const biometricCtrl  = require("../controllers/biometric.controller");
const pinCtrl        = require("../controllers/pin.controller");
const phoneOtpCtrl   = require("../controllers/phoneOtp.controller");
const nafathCtrl     = require("../controllers/nafath.controller");
const guestCtrl      = require("../controllers/guest.controller");

// ── Middleware ────────────────────────────────────────────────────────────────
const { protect }                                              = require("../middlewares/auth.middleware");
const { authLimiter, otpLimiter, passwordResetLimiter }       = require("../middlewares/rateLimiter");
const { joiValidate, joiValidateMulti }                       = require("../middlewares/joiValidate.middleware");
const { schemas }                                             = require("../validators/joi.validators");

// ── Standard Auth ─────────────────────────────────────────────────────────────
router.post("/register",              authLimiter, joiValidate(schemas.auth.register),       register);
router.post("/login",                 authLimiter, joiValidate(schemas.auth.login),          login);
router.post("/login/email",           authLimiter, joiValidate(schemas.auth.login),          login);
router.post("/refresh",               joiValidate(schemas.auth.refreshToken),                refreshToken);
router.post("/refresh-token",         joiValidate(schemas.auth.refreshToken),                refreshToken);
router.post("/logout",                protect, logout);
router.post("/logout/all",            protect, logoutAll);
router.get ("/me",                    protect, getMe);
router.get ("/session",               protect, checkSession);
router.post("/verify-email",          protect, joiValidate(schemas.auth.verifyEmail),        verifyEmail);
router.post("/resend-otp",            protect, resendOTP);
router.post("/forgot-password",       passwordResetLimiter, joiValidate(schemas.auth.forgotPassword), forgotPassword);
router.put ("/reset-password/:token", passwordResetLimiter, joiValidate(schemas.auth.resetPassword),  resetPassword);
router.put ("/change-password",       protect, joiValidate(schemas.auth.changePassword),     changePassword);
router.post("/social",                authLimiter, socialLogin);

// ── Phone OTP Login ───────────────────────────────────────────────────────────
router.post("/phone/send-otp",        otpLimiter, joiValidate(schemas.phoneOtp.send),        phoneOtpCtrl.sendOTP);
router.post("/phone/verify-otp",      otpLimiter, joiValidate(schemas.phoneOtp.verify),      phoneOtpCtrl.verifyOTP);
router.post("/phone/resend-otp",      otpLimiter, joiValidate(schemas.phoneOtp.send),        phoneOtpCtrl.resendOTP);
// Alternate path style
router.post("/login/phone/send",      otpLimiter, joiValidate(schemas.phoneOtp.send),        phoneOtpCtrl.sendOTP);
router.post("/login/phone/verify",    otpLimiter, joiValidate(schemas.phoneOtp.verify),      phoneOtpCtrl.verifyOTP);
router.post("/login/phone/resend",    otpLimiter, joiValidate(schemas.phoneOtp.send),        phoneOtpCtrl.resendOTP);
router.post("/otp/send",              otpLimiter, joiValidate(schemas.phoneOtp.send),        phoneOtpCtrl.sendOTP);
router.post("/otp/verify",            otpLimiter, joiValidate(schemas.phoneOtp.verify),      phoneOtpCtrl.verifyOTP);
router.post("/otp/resend",            otpLimiter, joiValidate(schemas.phoneOtp.send),        phoneOtpCtrl.resendOTP);

// ── Nafath (Saudi National ID) ────────────────────────────────────────────────
router.post("/nafath/initiate",                    authLimiter, joiValidate(schemas.nafath.initiate), nafathCtrl.initiate);
router.get ("/nafath/status/:transactionId",       nafathCtrl.checkStatus);
router.get ("/nafath/status/session/:sessionId",   nafathCtrl.checkStatus); // :sessionId alias (diagram compat)
router.post("/nafath/callback",                    nafathCtrl.callback);

// ── Biometric Authentication ──────────────────────────────────────────────────
router.get ("/biometric/status",      biometricCtrl.getBiometricStatus);          // no auth needed — uses deviceId
router.post("/biometric/enable",      protect, joiValidate(schemas.biometric.enable),   biometricCtrl.enableBiometric);
router.post("/biometric/register",    protect, joiValidate(schemas.biometric.enable),   biometricCtrl.enableBiometric); // alias
router.post("/biometric/verify",      authLimiter, joiValidate(schemas.biometric.verify), biometricCtrl.verifyBiometric);
router.post("/biometric/disable",     protect, joiValidate(schemas.biometric.disable),  biometricCtrl.disableBiometric);

// ── PIN Authentication ────────────────────────────────────────────────────────
router.post("/pin/set",               protect, joiValidate(schemas.pin.set),     pinCtrl.setPin);
router.post("/pin/verify",            authLimiter, joiValidate(schemas.pin.verify), pinCtrl.verifyPin);
router.delete("/pin",                 protect, joiValidate(schemas.pin.remove),  pinCtrl.removePin);

// ── Guest Session ─────────────────────────────────────────────────────────────
// Short alias  POST /api/auth/guest  → returns { guestId, guestToken, userType }
router.post("/guest",                 joiValidate(schemas.guest.createSession),                 guestCtrl.createGuestAlias);
router.post("/guest/session",         joiValidate(schemas.guest.createSession),                 guestCtrl.createSession);
router.post("/guest/convert",         authLimiter, joiValidate(schemas.guest.convert),          guestCtrl.convert);
router.get ("/guest/:guestId",        guestCtrl.getSession);
router.post("/guest/:guestId/cart",   joiValidate(schemas.guest.addToCart),                    guestCtrl.addToCart);
router.put ("/guest/:guestId/cart/:medicineId",
  joiValidateMulti({ body: schemas.guest.updateCartItem }),
  guestCtrl.updateCartItem
);
router.delete("/guest/:guestId/cart/:medicineId", guestCtrl.removeFromCart);

module.exports = router;
