const AppError = require("../utils/AppError");

/**
 * Joi validation middleware factory.
 *
 * @param {import('joi').Schema} schema   Joi schema to validate against
 * @param {"body"|"params"|"query"} [source="body"]   Which part of req to validate
 *
 * @example
 *   const { joiValidate } = require("../middleware/joiValidate.middleware");
 *   const { schemas }     = require("../validators/joi.validators");
 *
 *   router.post("/register", joiValidate(schemas.auth.register), register);
 *   router.get("/:id",       joiValidate(schemas.params.id, "params"), getOne);
 */
const joiValidate = (schema, source = "body") => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly:      false,   // collect ALL errors, not just the first
    allowUnknown:    true,    // pass through extra fields (e.g. deviceId added dynamically)
    stripUnknown:    false,
    convert:         true,    // coerce types (string "1" → number 1)
  });

  if (error) {
    const errors = error.details.map((d) => {
      const rawMsg = d.message.replace(/['"]/g, "");
      const [en, ar] = rawMsg.split(" | ");
      return {
        field:     d.context?.label || d.path.join("."),
        message:   en?.trim() || rawMsg,
        messageAr: ar?.trim() || null,
      };
    });

    return res.status(422).json({
      success:   false,
      status:    "fail",
      message:   "Validation failed | فشل التحقق من البيانات",
      errors,
    });
  }

  // Replace req[source] with validated + coerced values
  req[source] = value;
  next();
};

/**
 * Validate multiple sources at once.
 *
 * @param {{ body?, params?, query? }} schemas   Object mapping source → Joi schema
 *
 * @example
 *   router.put("/:id/cart/:medicineId",
 *     joiValidateMulti({ params: schemas.params.idAndMedicineId, body: schemas.cart.updateItem }),
 *     updateCartItem
 *   );
 */
const joiValidateMulti = (schemas) => (req, res, next) => {
  const errors = [];

  for (const [source, schema] of Object.entries(schemas)) {
    const { error, value } = schema.validate(req[source] || {}, {
      abortEarly:   false,
      allowUnknown: true,
      convert:      true,
    });

    if (error) {
      error.details.forEach((d) => {
        const rawMsg = d.message.replace(/['"]/g, "");
        const [en, ar] = rawMsg.split(" | ");
        errors.push({
          source,
          field:     d.context?.label || d.path.join("."),
          message:   en?.trim() || rawMsg,
          messageAr: ar?.trim() || null,
        });
      });
    } else {
      req[source] = value;
    }
  }

  if (errors.length) {
    return res.status(422).json({
      success: false,
      status:  "fail",
      message: "Validation failed | فشل التحقق من البيانات",
      errors,
    });
  }

  next();
};

module.exports = { joiValidate, joiValidateMulti };
