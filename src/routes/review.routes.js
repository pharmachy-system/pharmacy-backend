const express = require("express");
const router = express.Router({ mergeParams: true }); // mergeParams for :medicineId from parent
const {
  getMedicineReviews, createReview, updateReview, deleteReview, markHelpful,
  getAllReviews, moderateReview,
} = require("../controllers/review.controller");
const { protect } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/role.middleware");
const { joiValidate } = require("../middlewares/joiValidate.middleware");
const { schemas }     = require("../validators/joi.validators");

// GET /api/medicines/:medicineId/reviews
// GET /api/reviews (admin)
router.get("/", (req, res, next) => {
  if (req.params.medicineId) return getMedicineReviews(req, res, next);
  return authorize("admin", "pharmacist")(req, res, () => getAllReviews(req, res, next));
});

// POST /api/medicines/:medicineId/reviews
router.post("/", protect, joiValidate(schemas.review.create), createReview);

// Admin moderation
router.get("/admin/all", protect, authorize("admin", "pharmacist"), getAllReviews);
router.patch("/:id/moderate", protect, authorize("admin", "pharmacist"), moderateReview);

router.put("/:id", protect, joiValidate(schemas.review.update), updateReview);
router.delete("/:id", protect, deleteReview);
router.post("/:id/helpful", protect, markHelpful);

module.exports = router;
