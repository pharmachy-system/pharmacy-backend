const jwt = require("jsonwebtoken");
const User = require("../models/User.model");

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "Not authorized, no token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: "User not found or deactivated" });
    }

    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Token invalid or expired" });
  }
};

module.exports = { protect };
