const express = require("express");
const router  = express.Router();
const { getHomeScreen, getAppConfig } = require("../controllers/app.controller");

// Both endpoints are public — no auth required
router.get("/home",   getHomeScreen);
router.get("/config", getAppConfig);

module.exports = router;
