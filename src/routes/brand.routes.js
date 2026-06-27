const express = require("express");
const router = express.Router();
const {
  getAllBrands, getBrandById, createBrand, updateBrand, deleteBrand,
} = require("../controllers/brand.controller");
const { protect } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/role.middleware");
const { upload } = require("../utils/cloudinary.util");
const { strictLimiter } = require("../middlewares/rateLimiter");
const { joiValidate } = require("../middlewares/joiValidate.middleware");
const { schemas } = require("../validators/joi.validators");
const { cache } = require("../middlewares/cache.middleware");

router.get("/", cache(300), getAllBrands);
router.get("/:id", getBrandById);
router.post("/", protect, strictLimiter, authorize("admin"), upload.single("logo"), joiValidate(schemas.brand.create), createBrand);
router.put("/:id", protect, strictLimiter, authorize("admin"), upload.single("logo"), joiValidate(schemas.brand.update), updateBrand);
router.delete("/:id", protect, strictLimiter, authorize("admin"), deleteBrand);

module.exports = router;
