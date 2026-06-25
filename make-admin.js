require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User.model');

async function run() {
  console.log('Connecting...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected!');

  const email = 'omamahmolki@gmail.com';
  const newPassword = 'Admin@1234';
  const hashed = await bcrypt.hash(newPassword, 10);

  const user = await User.findOne({ email });
  if (!user) {
    console.log('User not found');
  } else {
    user.password = hashed;
    user.role = 'admin';
    await user.save();
    console.log('Updated:', user.email, '| role:', user.role);
  }

  process.exit(0);
}

run().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
