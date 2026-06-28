const express = require("express");
const router  = express.Router();
const { medicalChat, symptomCheck, recommend, checkInteractions } = require("../controllers/ai.controller");
const { protect }  = require("../middlewares/auth.middleware");
const rateLimiter  = require("express-rate-limit");

// AI routes: allow anon access but rate-limit to prevent abuse
const aiLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "طلبات كثيرة جداً. الرجاء الانتظار قليلاً." },
  skip: () => process.env.NODE_ENV === "test",
});

router.use(aiLimiter);

router.post("/chat",           medicalChat);
router.post("/symptom-check",  symptomCheck);
router.post("/recommend",      recommend);
router.post("/interactions",   checkInteractions);

module.exports = router;
