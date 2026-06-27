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
const { joiValidate } = require("../middlewares/joiValidate.middleware");
const { schemas } = require("../validators/joi.validators");

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
router.post("/", protect, authorize("admin", "pharmacist"), upload.array("images", 5), joiValidate(schemas.medicine.create), createMedicine);
router.put("/:id", protect, authorize("admin", "pharmacist"), upload.array("images", 5), joiValidate(schemas.medicine.update), updateMedicine);
router.delete("/:id", protect, authorize("admin"), deleteMedicine);
router.patch("/:id/stock", protect, authorize("admin", "pharmacist"), joiValidate(schemas.medicine.updateStock), updateStock);

module.exports = router;
