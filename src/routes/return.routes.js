const express = require("express");
const router  = express.Router();
const {
  createReturn,
  getMyReturns,
  getReturnById,
  getAllReturns,
  approveReturn,
  rejectReturn,
  completeReturn,
} = require("../controllers/return.controller");
const { protect } = require("../middlewares/auth.middleware");
const authorize   = require("../middlewares/role.middleware");
const { joiValidate } = require("../middlewares/joiValidate.middleware");
const { schemas }     = require("../validators/joi.validators");

router.use(protect);

// ── Customer ──────────────────────────────────────────────────────────────────
router.post("/",     joiValidate(schemas.returnRequest.create), createReturn);
router.get("/my",    getMyReturns);
router.get("/:id",   getReturnById);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.get("/",                       authorize("admin", "pharmacist"), getAllReturns);
router.patch("/:id/approve",          authorize("admin"), joiValidate(schemas.returnRequest.approve), approveReturn);
router.patch("/:id/reject",           authorize("admin"), joiValidate(schemas.returnRequest.reject),  rejectReturn);
router.patch("/:id/complete",         authorize("admin"),               completeReturn);

module.exports = router;
