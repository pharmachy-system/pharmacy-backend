console.log("[START] Starting index.js...");

process.on('uncaughtException', (err) => {
  console.error("[ERROR] Uncaught Exception:", err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error("[ERROR] Unhandled Rejection:", err);
  process.exit(1);
});

console.log("[STEP 1] Loading env config...");
const config = require('./src/config/env');
console.log("[OK] config loaded, PORT:", config.port);

console.log("[STEP 2] Loading app...");
const app = require('./src/app');
console.log("[OK] app loaded");

console.log("[STEP 3] Loading connectDB...");
const connectDB = require('./src/config/db');
console.log("[OK] connectDB loaded");

const PORT = config.port || 5000;

console.log("[STEP 4] Calling connectDB()...");
connectDB()
  .then(() => {
    console.log("[OK] DB connected successfully");
    app.listen(PORT, () => {
      console.log("[SUCCESS] Server running on port " + PORT);
    });
  })
  .catch((error) => {
    console.error("[FAIL] Failed to start server:", error);
    process.exit(1);
  });