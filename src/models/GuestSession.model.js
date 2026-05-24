const mongoose = require("mongoose");

const guestCartItemSchema = new mongoose.Schema(
  {
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: "Medicine" },
    quantity:  { type: Number, default: 1, min: 1 },
    price:     Number,
    name:      String,
    image:     String,
  },
  { _id: false }
);

const guestSessionSchema = new mongoose.Schema(
  {
    guestId:   { type: String, required: true, unique: true }, // client-generated UUID
    cart:      [guestCartItemSchema],
    deviceId:  String,
    ipAddress: String,
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true }
);

// Auto-delete after expiry
guestSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("GuestSession", guestSessionSchema);
