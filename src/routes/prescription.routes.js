const express = require("express");
const router = express.Router();
const {
  getAllPrescriptions, getPrescriptionById, createPrescription,
  updatePrescriptionStatus, getUserPrescriptions,
} = require("../controllers/prescription.controller");
const { protect } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/role.middleware");
const { upload } = require("../utils/cloudinary.util");

router.use(protect);

router.get("/my-prescriptions", getUserPrescriptions);
router.get("/", authorize("admin", "pharmacist"), getAllPrescriptions);
router.post("/", upload.array("images", 3), createPrescription);
router.get("/:id", getPrescriptionById);
router.put("/:id/status", authorize("admin", "pharmacist"), updatePrescriptionStatus);

module.exports = router;
