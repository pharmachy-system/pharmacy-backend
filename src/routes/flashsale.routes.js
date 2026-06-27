const express = require("express");
const router = express.Router();
const {
  getActiveFlashSale, getAllFlashSales, getFlashSaleById,
  createFlashSale, updateFlashSale, toggleFlashSale, deleteFlashSale,
  addMedicines, removeMedicines,
} = require("../controllers/flashsale.controller");
const { protect } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/role.middleware");
const { upload } = require("../utils/cloudinary.util");
const { joiValidate } = require("../middlewares/joiValidate.middleware");
const { schemas } = require("../validators/joi.validators");

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/active", getActiveFlashSale);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.use(protect, authorize("admin", "pharmacist"));

router.get("/", getAllFlashSales);
router.post("/", upload.single("banner"), joiValidate(schemas.flashSale.create), createFlashSale);
router.get("/:id", getFlashSaleById);
router.put("/:id", upload.single("banner"), joiValidate(schemas.flashSale.update), updateFlashSale);
router.patch("/:id/toggle", toggleFlashSale);
router.delete("/:id", authorize("admin"), deleteFlashSale);
router.post("/:id/medicines", addMedicines);
router.delete("/:id/medicines", removeMedicines);

module.exports = router;
