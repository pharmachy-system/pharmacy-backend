/**
 * Docker HEALTHCHECK script.
 * Called by the container runtime every 30 seconds.
 * Exits 0 (healthy) if /health returns 200; exits 1 otherwise.
 */
const http = require("http");

const options = {
  hostname: "localhost",
  port: process.env.PORT || 5000,
  path: "/health",
  method: "GET",
  timeout: 5000,
};

const req = http.request(options, (res) => {
  process.exit(res.statusCode === 200 ? 0 : 1);
});

req.on("error", () => process.exit(1));
req.on("timeout", () => { req.destroy(); process.exit(1); });

req.end();
