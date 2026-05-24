const express = require("express");
const router = express.Router();
const {
  getAllMedicines, getMedicineById, getMedicineBySlug, createMedicine,
  updateMedicine, deleteMedicine, getLowStockMedicines, getExpiringMedicines,
  updateStock, checkInteractions,
} = require("../controllers/medicine.controller");
const { protect } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/role.middleware");
const { upload } = require("../utils/cloudinary.util");

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/", getAllMedicines);
router.get("/slug/:slug", getMedicineBySlug);
router.post("/check-interactions", protect, checkInteractions);

// ── Admin / Pharmacist alerts ─────────────────────────────────────────────────
router.get("/alerts/low-stock", protect, authorize("admin", "pharmacist"), getLowStockMedicines);
router.get("/alerts/expiring", protect, authorize("admin", "pharmacist"), getExpiringMedicines);

// ── Single medicine ───────────────────────────────────────────────────────────
router.get("/:id", getMedicineById);

// ── Admin CRUD ────────────────────────────────────────────────────────────────
router.post("/", protect, authorize("admin", "pharmacist"), upload.array("images", 5), createMedicine);
router.put("/:id", protect, authorize("admin", "pharmacist"), upload.array("images", 5), updateMedicine);
router.delete("/:id", protect, authorize("admin"), deleteMedicine);
router.patch("/:id/stock", protect, authorize("admin", "pharmacist"), updateStock);

module.exports = router;
