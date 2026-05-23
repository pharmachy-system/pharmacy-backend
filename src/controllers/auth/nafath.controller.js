/**
 * Nafath Controller — Saudi National Digital ID Authentication
 *
 * Nafath is Saudi Arabia's official national digital identity platform
 * operated by the National Information Center (NIC / elm.sa).
 *
 * Flow:
 *   1. POST /api/auth/nafath/initiate  { nationalId }
 *      → Server calls Nafath API → gets transactionId + random number
 *      → Client displays "Open Nafath app and approve #XX"
 *
 *   2. GET  /api/auth/nafath/status/:transactionId  (client polls every 3s)
 *      → Server polls Nafath API for status
 *      → pending / approved / rejected / expired
 *      → On "approved": find/create user, issue tokens
 *
 *   3. POST /api/auth/nafath/callback  (webhook from Nafath — optional)
 *
 * Environment variables required:
 *   NAFATH_APP_ID     - Your application ID registered with elm.sa
 *   NAFATH_APP_KEY    - Your application API key
 *   NAFATH_BASE_URL   - Nafath API base URL (default: https://nafath.api.elm.sa)
 *   NAFATH_SERVICE_ID - Your service identifier (e.g., "PHARMACY_APP")
 */

const crypto = require("crypto");
const User = require("../../models/User.model");
const { extractDeviceInfo, upsertSession } = require("../../utils/session.util");
const { generateAccessToken, generateRefreshToken } = require("../../utils/token.util");

// In-memory store for pending transactions (use Redis in production)
// key: transactionId → { nationalId, status, userData, createdAt }
const pendingTransactions = new Map();
const TRANSACTION_TTL_MS  = 5 * 60 * 1000; // 5 minutes

// ─── Nafath API client (lazy init) ───────────────────────────────────────────
const nafathApi = {
  baseUrl:   () => process.env.NAFATH_BASE_URL   || "https://nafath.api.elm.sa",
  appId:     () => process.env.NAFATH_APP_ID     || "",
  appKey:    () => process.env.NAFATH_APP_KEY    || "",
  serviceId: () => process.env.NAFATH_SERVICE_ID || "PHARMACY_APP",

  headers() {
    return {
      "Content-Type": "application/json",
      "app-id":  this.appId(),
      "app-key": this.appKey(),
    };
  },

  isConfigured() {
    return !!(this.appId() && this.appKey());
  },

  // POST /api/v1/otp/request  — initiate authentication
  async initiateAuth(nationalId) {
    const reqId = crypto.randomBytes(8).toString("hex");

    if (!this.isConfigured()) {
      // Development mock
      const transactionId = `mock_txn_${crypto.randomBytes(6).toString("hex")}`;
      const randomNum     = String(Math.floor(10 + Math.random() * 90)); // 2-digit number
      return { transactionId, reqId, randomNum, mock: true };
    }

    const response = await fetch(`${this.baseUrl()}/api/v1/otp/request`, {
      method:  "POST",
      headers: this.headers(),
      body: JSON.stringify({
        nationalId,
        serviceId: this.serviceId(),
        reqId,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `Nafath API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      transactionId: data.transId || data.transactionId,
      reqId:         data.reqId,
      randomNum:     data.random || data.randomNumber,
    };
  },

  // GET /api/v1/otp/request/{transId}/{reqId}  — poll status
  async getStatus(transactionId, reqId) {
    if (!this.isConfigured()) {
      // Mock: auto-approve after 5 seconds for dev testing
      const txn = pendingTransactions.get(transactionId);
      if (!txn) return { status: "expired" };

      const elapsed = Date.now() - txn.createdAt;
      if (elapsed > 5000) {
        return {
          status: "approved",
          nationalId: txn.nationalId,
          nameAr: "مستخدم نافذ",
          nameEn: "Nafath User",
        };
      }
      return { status: "pending" };
    }

    const response = await fetch(
      `${this.baseUrl()}/api/v1/otp/request/${transactionId}/${reqId}`,
      { headers: this.headers() }
    );

    if (!response.ok) throw new Error(`Nafath status check failed: ${response.status}`);
    return response.json();
  },
};

// ─── Initiate Nafath authentication ──────────────────────────────────────────
exports.initiate = async (req, res, next) => {
  try {
    const { nationalId } = req.body;

    if (!nationalId || !/^\d{10}$/.test(nationalId)) {
      return res.status(400).json({ success: false, message: "Valid 10-digit Saudi National ID is required" });
    }

    const { transactionId, reqId, randomNum, mock } = await nafathApi.initiateAuth(nationalId);

    // Store pending transaction
    pendingTransactions.set(transactionId, {
      nationalId,
      reqId,
      status: "pending",
      createdAt: Date.now(),
    });

    // Auto-cleanup after TTL
    setTimeout(() => pendingTransactions.delete(transactionId), TRANSACTION_TTL_MS);

    res.json({
      success: true,
      transactionId,
      randomNumber: randomNum,          // user sees this in Nafath app to confirm
      message: "Open the Nafath app and approve the request showing this number",
      expiresIn: 300,                   // seconds
      pollInterval: 3,                  // recommended polling interval in seconds
      mock: mock || undefined,
    });
  } catch (err) {
    next(err);
  }
};

// ─── Poll Nafath status ───────────────────────────────────────────────────────
exports.checkStatus = async (req, res, next) => {
  try {
    const { transactionId } = req.params;

    const txn = pendingTransactions.get(transactionId);
    if (!txn) {
      return res.status(404).json({ success: false, message: "Transaction not found or expired", status: "expired" });
    }

    // Check client-side TTL
    if (Date.now() - txn.createdAt > TRANSACTION_TTL_MS) {
      pendingTransactions.delete(transactionId);
      return res.json({ success: true, status: "expired", message: "Authentication request expired. Please try again." });
    }

    const result = await nafathApi.getStatus(transactionId, txn.reqId);
    const status  = result.status?.toLowerCase() || "pending";

    if (status === "approved") {
      pendingTransactions.delete(transactionId);

      const nafathId = result.nationalId || txn.nationalId;
      const nameAr   = result.nameAr || result.arabicName || "";
      const nameEn   = result.nameEn || result.englishName || "";

      // Find or create user by Nafath ID
      let user = await User.findOne({ nafathId });
      if (!user) {
        // Try matching by national ID stored separately (if user registered with phone/email)
        user = await User.create({
          name:           nameEn || nameAr || `User_${nafathId.slice(-4)}`,
          email:          `${nafathId}@nafath.pharmacy.local`,
          nafathId,
          nafathVerified: true,
          isEmailVerified: true,
        });
      } else {
        user.nafathVerified = true;
        if (nameEn && !user.name) user.name = nameEn;
        await user.save({ validateBeforeSave: false });
      }

      if (!user.isActive) {
        return res.status(403).json({ success: false, message: "Account is deactivated" });
      }

      const accessToken  = generateAccessToken(user._id);
      const refreshToken = generateRefreshToken(user._id);

      user.refreshToken = refreshToken;
      user.lastLogin    = new Date();
      await user.save({ validateBeforeSave: false });

      const deviceInfo = extractDeviceInfo(req);
      await upsertSession(user._id, refreshToken, deviceInfo, req);

      return res.json({
        success: true,
        status: "approved",
        accessToken,
        refreshToken,
        user: {
          id:             user._id,
          name:           user.name,
          nafathVerified: user.nafathVerified,
          role:           user.role,
        },
      });
    }

    if (status === "rejected") {
      pendingTransactions.delete(transactionId);
      return res.json({ success: false, status: "rejected", message: "Authentication was rejected in the Nafath app" });
    }

    if (status === "expired") {
      pendingTransactions.delete(transactionId);
      return res.json({ success: false, status: "expired", message: "Authentication request expired" });
    }

    // Still pending
    res.json({ success: true, status: "pending", message: "Waiting for user approval in Nafath app" });
  } catch (err) {
    next(err);
  }
};

// ─── Webhook callback (optional — if Nafath pushes results) ──────────────────
exports.callback = async (req, res, next) => {
  try {
    // Verify the request is from Nafath (signature check)
    const signature = req.headers["x-nafath-signature"] || "";
    const expected  = crypto
      .createHmac("sha256", process.env.NAFATH_APP_KEY || "dev")
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (nafathApi.isConfigured() && signature !== expected) {
      return res.status(401).json({ success: false, message: "Invalid signature" });
    }

    const { transId, status, nationalId } = req.body;

    if (status === "APPROVED" && transId) {
      const txn = pendingTransactions.get(transId);
      if (txn) {
        txn.status     = "approved";
        txn.nationalId = nationalId || txn.nationalId;
      }
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
