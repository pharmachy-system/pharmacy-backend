const AppError = require("../utils/AppError");

const notFound = (req, res, next) => {
  next(AppError.notFound(`Route ${req.originalUrl}`));
};

module.exports = notFound;