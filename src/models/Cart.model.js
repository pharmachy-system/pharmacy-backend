const mongoose = require("mongoose");

const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  sessionId: { type: String },
  items: [{
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: "Medicine", required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    price: { type: Number, required: true },
    name: { type: String },
  }],
  coupon: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
  couponDiscount: { type: Number, default: 0 },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// One cart per user / per guest session
cartSchema.index({ user: 1 }, { unique: true, sparse: true });
cartSchema.index({ sessionId: 1 }, { unique: true, sparse: true });
// TTL: auto-remove abandoned guest carts after 30 days
cartSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60, partialFilterExpression: { user: { $exists: false } } });

cartSchema.virtual("subtotal").get(function () {
  return parseFloat(this.items.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2));
});
cartSchema.virtual("itemCount").get(function () {
  return this.items.reduce((s, i) => s + i.quantity, 0);
});

module.exports = mongoose.model("Cart", cartSchema);
