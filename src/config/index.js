/**
 * Config barrel export.
 *
 * const { logger, swaggerSpec, corsOptions } = require("../config");
 */

module.exports = {
  logger:      require("./logger.config"),
  swaggerSpec: require("./swagger.config"),
  corsOptions: require("./cors.config"),
};
