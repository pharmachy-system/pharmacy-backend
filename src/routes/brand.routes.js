const express = require("express");
const router = express.Router();
const {
  getAllBrands, getBrandById, createBrand, updateBrand, deleteBrand,
} = require("../controllers/brand.controller");
const { protect } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/role.middleware");
const { upload } = require("../utils/cloudinary.util");

router.get("/", getAllBrands);
router.get("/:id", getBrandById);
router.post("/", protect, authorize("admin"), upload.single("logo"), createBrand);
router.put("/:id", protect, authorize("admin"), upload.single("logo"), updateBrand);
router.delete("/:id", protect, authorize("admin"), deleteBrand);

module.exports = router;
