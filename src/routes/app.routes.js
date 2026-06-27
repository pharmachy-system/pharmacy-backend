const express = require("express");
const router  = express.Router();
const { getHomeScreen, getAppConfig } = require("../controllers/app.controller");
const { cache } = require("../middlewares/cache.middleware");

// Both endpoints are public — no auth required
// Home screen cached for 60s (runs 6 DB queries; data changes infrequently)
// Config cached for 5 minutes (changes only on admin action / env var update)
router.get("/home",   cache(60),  getHomeScreen);
router.get("/config", cache(300), getAppConfig);

module.exports = router;
