require("dotenv").config();


const app = require("./src/app");
const connectDB = require("./src/db");

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV || "development"}]`);
    console.log(`📚 API Docs: http://localhost:${PORT}/api/docs`);
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n${signal} received. Closing server...`);
    server.close(() => {
      console.log("Server closed.");
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

start().catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
