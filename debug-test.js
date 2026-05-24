require("dotenv").config();

const mongoose = require("mongoose");

const uri = process.env.MONGO_URI;

console.log("=================");
console.log("URI Length:", uri ? uri.length : "UNDEFINED");
console.log("First 50 chars:", uri ? uri.substring(0, 50) : "N/A");
console.log("Last 30 chars:", uri ? uri.substring(uri.length - 30) : "N/A");
console.log("=================");

mongoose.set("debug", true);

async function connect() {
  try {
    console.log("Attempting to connect...");
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      tls: true,
      tlsAllowInvalidCertificates: true,
    });
    console.log(">>> SUCCESS <<<");
    console.log("✅ Connected to MongoDB");
    console.log("Database name:", mongoose.connection.name);
    console.log("Host:", mongoose.connection.host);
    process.exit(0);
  } catch (err) {
    console.log(">>> FAILED <<<");
    console.log("Error type:", err.name);
    console.log("Error code:", err.code);
    console.log("Full message:", err.message);
    if (err.reason) {
      console.log("Reason:", JSON.stringify(err.reason, null, 2));
    }
    process.exit(1);
  }
}

connect();