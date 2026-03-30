const express = require("express");
const router = express.Router();
const {
  getActiveFlashSale, getAllFlashSales, getFlashSaleById,
  createFlashSale, updateFlashSale, toggleFlashSale, deleteFlashSale,
  addMedicines, removeMedicines,
} = require("../controllers/flashsale.controller");
const { protect } = require("../middleware/auth.middleware");
const authorize = require("../middleware/role.middleware");
const { upload } = require("../utils/cloudinary.util");

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/active", getActiveFlashSale);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.use(protect, authorize("admin", "pharmacist"));

router.get("/", getAllFlashSales);
router.post("/", upload.single("banner"), createFlashSale);
router.get("/:id", getFlashSaleById);
router.put("/:id", upload.single("banner"), updateFlashSale);
router.patch("/:id/toggle", toggleFlashSale);
router.delete("/:id", authorize("admin"), deleteFlashSale);
router.post("/:id/medicines", addMedicines);
router.delete("/:id/medicines", removeMedicines);

module.exports = router;
