const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/auth.middleware");
const {
  getDevices,
  getCurrentDevice,
  updateDevice,
  removeDevice,
  removeAllDevices,
} = require("../controllers/auth/device.controller");

// All device routes require authentication
router.use(protect);

router.get("/",              getDevices);
router.get("/current",       getCurrentDevice);
router.put("/:deviceId",     updateDevice);
router.delete("/",           removeAllDevices);
router.delete("/:deviceId",  removeDevice);

module.exports = router;
