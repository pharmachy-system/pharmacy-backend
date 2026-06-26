const cron = require("node-cron");
const logger = require("../config/logger.config");

// ─── Lazy model imports (loaded after DB connects) ────────────────────────────

const jobs = [];

function schedule(expression, name, fn) {
  const task = cron.schedule(expression, async () => {
    try {
      await fn();
    } catch (err) {
      logger.error(`[CRON] ${name} failed:`, { message: err.message, stack: err.stack });
    }
  });
  jobs.push({ name, task });
  logger.info(`[CRON] Scheduled: ${name} (${expression})`);
  return task;
}

// ─── Job: Flash sale auto-toggle ──────────────────────────────────────────────
// Every 5 minutes — activate sales whose startDate has passed, deactivate expired ones

async function syncFlashSales() {
  const FlashSale = require("../models/FlashSale.model");
  const now = new Date();

  const [activated, deactivated] = await Promise.all([
    FlashSale.updateMany(
      { isActive: false, startDate: { $lte: now }, endDate: { $gt: now } },
      { $set: { isActive: true } }
    ),
    FlashSale.updateMany(
      { isActive: true, endDate: { $lte: now } },
      { $set: { isActive: false } }
    ),
  ]);

  if (activated.modifiedCount || deactivated.modifiedCount) {
    logger.info(`[CRON] Flash sales — activated: ${activated.modifiedCount}, deactivated: ${deactivated.modifiedCount}`);
  }
}

// ─── Job: Low stock alerts ────────────────────────────────────────────────────
// Daily at 08:00 AM — notify admins about medicines below threshold

async function sendLowStockAlerts() {
  const Medicine = require("../models/Medicine.model");
  const User     = require("../models/User.model");
  const { bulkNotify } = require("../utils/notification.util");

  const lowStock = await Medicine.find({
    $expr: { $lte: ["$stock", "$lowStockThreshold"] },
    isActive: { $ne: false },
  }).select("name nameAr stock lowStockThreshold sku").lean();

  if (!lowStock.length) return;

  const admins = await User.find({ role: { $in: ["admin", "pharmacist"] }, isActive: true })
    .select("_id").lean();
  if (!admins.length) return;

  const adminIds = admins.map((a) => a._id.toString());
  const itemList = lowStock
    .map((m) => `${m.name} (${m.sku || "—"}): ${m.stock} left`)
    .join(", ");

  await bulkNotify(adminIds, {
    type:  "system",
    title: `Low Stock Alert: ${lowStock.length} medicine${lowStock.length > 1 ? "s" : ""}`,
    body:  itemList.length > 200 ? itemList.slice(0, 197) + "…" : itemList,
    data:  { screen: "admin/inventory", count: lowStock.length },
  });

  logger.info(`[CRON] Low stock alert sent for ${lowStock.length} medicine(s) to ${adminIds.length} admin(s)`);
}

// ─── Job: Prescription expiry reminders ──────────────────────────────────────
// Daily at 09:00 AM — remind users whose prescriptions expire in 7 days

async function sendPrescriptionExpiryReminders() {
  const Prescription = require("../models/Prescription.model");
  const { createNotification } = require("../utils/notification.util");

  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const tomorrow        = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const expiring = await Prescription.find({
    expiryDate: { $gte: tomorrow, $lte: sevenDaysFromNow },
    status:     "approved",
  }).select("user expiryDate").lean();

  let sent = 0;
  for (const rx of expiring) {
    const daysLeft = Math.ceil((new Date(rx.expiryDate) - Date.now()) / (1000 * 60 * 60 * 24));
    await createNotification({
      userId: rx.user.toString(),
      type:   "prescription",
      title:  "Prescription Expiring Soon",
      body:   `Your prescription expires in ${daysLeft} day${daysLeft > 1 ? "s" : ""}. Renew it before it lapses.`,
      data:   { prescriptionId: rx._id.toString(), daysLeft },
    });
    sent++;
  }

  if (sent) logger.info(`[CRON] Prescription expiry reminders sent: ${sent}`);
}

// ─── Job: Deactivate expired coupons ─────────────────────────────────────────
// Daily at 03:00 AM

async function deactivateExpiredCoupons() {
  const Coupon = require("../models/Coupon.model");
  const result = await Coupon.updateMany(
    { isActive: true, validUntil: { $lt: new Date() } },
    { $set: { isActive: false } }
  );
  if (result.modifiedCount) {
    logger.info(`[CRON] Deactivated ${result.modifiedCount} expired coupon(s)`);
  }
}

// ─── Job: Purge expired sessions ─────────────────────────────────────────────
// Daily at 02:00 AM — remove sessions past their expiresAt

async function purgeExpiredSessions() {
  const Session = require("../models/Session.model");
  const result = await Session.deleteMany({ expiresAt: { $lt: new Date() } });
  if (result.deletedCount) {
    logger.info(`[CRON] Purged ${result.deletedCount} expired session(s)`);
  }
}

// ─── Job: Purge expired guest sessions ───────────────────────────────────────
// Daily at 02:30 AM

async function purgeGuestSessions() {
  const GuestSession = require("../models/GuestSession.model");
  const result = await GuestSession.deleteMany({ expiresAt: { $lt: new Date() } });
  if (result.deletedCount) {
    logger.info(`[CRON] Purged ${result.deletedCount} expired guest session(s)`);
  }
}

// ─── Start all jobs ───────────────────────────────────────────────────────────

exports.startJobs = function startJobs() {
  // Flash sale sync — every 5 minutes
  schedule("*/5 * * * *", "flash-sale-sync", syncFlashSales);

  // Low stock alerts — daily at 08:00
  schedule("0 8 * * *", "low-stock-alerts", sendLowStockAlerts);

  // Prescription expiry reminders — daily at 09:00
  schedule("0 9 * * *", "prescription-expiry-reminders", sendPrescriptionExpiryReminders);

  // Deactivate expired coupons — daily at 03:00
  schedule("0 3 * * *", "expired-coupon-cleanup", deactivateExpiredCoupons);

  // Purge expired sessions — daily at 02:00
  schedule("0 2 * * *", "session-cleanup", purgeExpiredSessions);

  // Purge expired guest sessions — daily at 02:30
  schedule("30 2 * * *", "guest-session-cleanup", purgeGuestSessions);

  logger.info(`[CRON] ${jobs.length} job(s) scheduled`);
};

exports.stopJobs = function stopJobs() {
  jobs.forEach(({ name, task }) => {
    task.stop();
    logger.info(`[CRON] Stopped: ${name}`);
  });
};
