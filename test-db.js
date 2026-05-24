const connectDB = require('./src/config/db');

console.log('
connectDB()
  .then(() => {
    console.log MongoDB connected successfully!');(
    process.exit(0);
  })
  .catch((err) => {
    console. MongoDB connection failed:');error('
    console.error(err);
    process.exit(1);
  });

setTimeout(() => {
  console.Timeout after 30 seconds');error('
  process.exit(1);
}, 30000);
