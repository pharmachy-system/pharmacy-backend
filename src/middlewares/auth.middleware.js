const jwt = require("jsonwebtoken");
const User = require("../models/User.model");
const Session = require("../models/Session.model");
const AppError = require("../utils/AppError");

const protect = async (req, res, next) => {
  // 1. Extract Bearer token
  let token;
  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) {
    return next(AppError.unauthorized("Not authorized — no token provided"));
  }

  // 2. Verify JWT signature + expiry
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    const msg =
      err.name === "TokenExpiredError"
        ? "Token has expired. Please log in again."
        : "Invalid token. Please log in again.";
    return next(AppError.unauthorized(msg));
  }

  // 3. Load user
  const user = await User.findById(decoded.id);
  if (!user) return next(AppError.unauthorized("User account no longer exists"));
  if (!user.isActive) {
    return next(
      AppError.unauthorized(
        `Account is deactivated${user.blockedReason ? ": " + user.blockedReason : ""}`
      )
    );
  }

  // 4. Check active session (if device ID present or we can match by token hash)
  const deviceId = req.headers["x-device-id"] || req.body?.deviceId;
  if (deviceId) {
    const session = await Session.findOne({
      deviceId,
      user:      decoded.id,
      isActive:  true,
      expiresAt: { $gt: new Date() },
    });
    if (!session) {
      return next(AppError.unauthorized("Session expired or revoked. Please log in again."));
    }
  }

  req.user = user;
  next();
};

// Like protect but never rejects — sets req.user if a valid token is present,
// otherwise just calls next() without error. Used for endpoints that are public
// but can enrich the response when authenticated (e.g. recently-viewed tracking).
const optionalProtect = async (req, _res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (user && user.isActive) req.user = user;
  } catch (_) { /* invalid token — silently ignore */ }
  next();
};

module.exports = { protect, optionalProtect };
