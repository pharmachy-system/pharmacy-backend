require("dotenv").config();

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({
    binary: { version: "6.0.12" },
  });
  const uri = mongod.getUri();
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
  await mongoose.connect(uri);
}, 60000);

afterAll(async () => {
  await mongoose.connection.close();
  if (mongod) await mongod.stop();
});
