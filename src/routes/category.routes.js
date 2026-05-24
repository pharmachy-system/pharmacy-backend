const express = require("express");
const router = express.Router();
const {
  getAllCategories, getCategoryById, createCategory, updateCategory, deleteCategory,
} = require("../controllers/category.controller");
const { protect } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/role.middleware");
const { upload } = require("../utils/cloudinary.util");

router.get("/", getAllCategories);
router.get("/:id", getCategoryById);
router.post("/", protect, authorize("admin"), upload.single("image"), createCategory);
router.put("/:id", protect, authorize("admin"), upload.single("image"), updateCategory);
router.delete("/:id", protect, authorize("admin"), deleteCategory);

module.exports = router;
