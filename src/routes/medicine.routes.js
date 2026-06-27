const express = require("express");
const router = express.Router();
const {
  getAllMedicines, getMedicineById, getMedicineBySlug, createMedicine,
  updateMedicine, deleteMedicine, getLowStockMedicines, getExpiringMedicines,
  updateStock, checkInteractions, smartSearch, getAlternatives, updateAlternatives,
} = require("../controllers/medicine.controller");
const { protect } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/role.middleware");
const { upload } = require("../utils/cloudinary.util");
const { joiValidate } = require("../middlewares/joiValidate.middleware");
const { schemas } = require("../validators/joi.validators");
const { audit } = require("../middlewares/audit.middleware");

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/",                     getAllMedicines);
router.get("/search/smart",         smartSearch);
router.get("/slug/:slug",           getMedicineBySlug);
router.post("/check-interactions",  protect, checkInteractions);

// ── Admin / Pharmacist alerts ─────────────────────────────────────────────────
router.get("/alerts/low-stock", protect, authorize("admin", "pharmacist"), getLowStockMedicines);
router.get("/alerts/expiring",  protect, authorize("admin", "pharmacist"), getExpiringMedicines);

// ── Single medicine ───────────────────────────────────────────────────────────
router.get("/:id", getMedicineById);

// ── Alternatives (public read, admin write) ───────────────────────────────────
router.get("/:id/alternatives",   getAlternatives);
router.patch("/:id/alternatives", protect, authorize("admin", "pharmacist"), audit("UPDATE_ALTERNATIVES", "Medicine"), updateAlternatives);

// ── Admin CRUD ────────────────────────────────────────────────────────────────
router.post("/", protect, authorize("admin", "pharmacist"), upload.array("images", 5), joiValidate(schemas.medicine.create), audit("CREATE", "Medicine"), createMedicine);
router.put("/:id", protect, authorize("admin", "pharmacist"), upload.array("images", 5), joiValidate(schemas.medicine.update), audit("UPDATE", "Medicine"), updateMedicine);
router.delete("/:id", protect, authorize("admin"), audit("DELETE", "Medicine"), deleteMedicine);
router.patch("/:id/stock", protect, authorize("admin", "pharmacist"), joiValidate(schemas.medicine.updateStock), audit("STOCK_UPDATE", "Medicine"), updateStock);

module.exports = router;
