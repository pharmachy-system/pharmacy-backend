const express = require("express");
const router = express.Router();
const {
  getAllArticles, getArticleBySlug, getArticleById,
  createArticle, updateArticle, deleteArticle,
} = require("../controllers/article.controller");
const { protect } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/role.middleware");
const { upload } = require("../utils/cloudinary.util");

router.get("/", getAllArticles);
router.get("/slug/:slug", getArticleBySlug);
router.get("/:id", getArticleById);

router.use(protect);
router.post("/", authorize("admin", "pharmacist"), upload.single("image"), createArticle);
router.put("/:id", authorize("admin", "pharmacist"), upload.single("image"), updateArticle);
router.delete("/:id", authorize("admin"), deleteArticle);

module.exports = router;
