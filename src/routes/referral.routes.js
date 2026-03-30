const express = require("express");
const router = express.Router();
const {
  getMyReferral, getReferredUsers, validateReferralCode, getReferralStats,
} = require("../controllers/referral.controller");
const { protect } = require("../middleware/auth.middleware");
const authorize = require("../middleware/role.middleware");

// ── Public ─────────────────────────────────────────────────────────────────
router.get("/validate/:code", validateReferralCode);

// ── Authenticated user ─────────────────────────────────────────────────────
router.use(protect);
router.get("/me", getMyReferral);
router.get("/me/referred-users", getReferredUsers);

// ── Admin ──────────────────────────────────────────────────────────────────
router.get("/admin/stats", authorize("admin"), getReferralStats);

module.exports = router;
