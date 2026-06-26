const express = require("express");
const router = express.Router();
const {
  getAllCategories, getCategoryById, createCategory, updateCategory, deleteCategory,
} = require("../controllers/category.controller");
const { protect } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/role.middleware");
const { upload } = require("../utils/cloudinary.util");
const { joiValidate } = require("../middlewares/joiValidate.middleware");
const { schemas } = require("../validators/joi.validators");
const { strictLimiter } = require("../middlewares/rateLimiter");

router.get("/", getAllCategories);
router.get("/:id", getCategoryById);
router.post("/", protect, strictLimiter, authorize("admin"), upload.single("image"), joiValidate(schemas.category.create), createCategory);
router.put("/:id", protect, strictLimiter, authorize("admin"), upload.single("image"), joiValidate(schemas.category.update), updateCategory);
router.delete("/:id", protect, strictLimiter, authorize("admin"), deleteCategory);

module.exports = router;
