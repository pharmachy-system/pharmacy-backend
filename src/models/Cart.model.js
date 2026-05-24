const mongoose = require("mongoose");

const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", sparse: true },
  sessionId: { type: String, sparse: true },
  items: [{
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: "Medicine", required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    price: { type: Number, required: true },
    name: { type: String },
  }],
  coupon: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
  couponDiscount: { type: Number, default: 0 },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Indexes created by sparse: true on field definitions above

cartSchema.virtual("subtotal").get(function () {
  return parseFloat(this.items.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2));
});
cartSchema.virtual("itemCount").get(function () {
  return this.items.reduce((s, i) => s + i.quantity, 0);
});

module.exports = mongoose.model("Cart", cartSchema);
