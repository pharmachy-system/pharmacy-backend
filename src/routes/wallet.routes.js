const express = require("express");
const router = express.Router();
const { getWallet, getTransactions, creditWallet, debitWallet } = require("../controllers/wallet.controller");
const { protect } = require("../middleware/auth.middleware");
const authorize = require("../middleware/role.middleware");

router.use(protect);

router.get("/", getWallet);
router.get("/transactions", getTransactions);
router.post("/credit", authorize("admin"), creditWallet);
router.post("/debit", debitWallet);

module.exports = router;
