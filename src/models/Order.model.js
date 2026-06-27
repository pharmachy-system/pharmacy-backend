const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items: [{
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: "Medicine" },
    name: { type: String, required: true },
    image: { type: String },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    requiresPrescription: { type: Boolean, default: false },
  }],
  prescription: { type: mongoose.Schema.Types.ObjectId, ref: "Prescription" },
  shippingAddress: {
    fullName: String, phone: String, street: String, city: String,
    region: String, postalCode: String, country: { type: String, default: "SA" },
    lat: Number, lng: Number,
  },
  status: {
    type: String,
    enum: ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"],
    default: "pending",
  },
  paymentMethod: { type: String, enum: ["cash", "card", "wallet"], required: true },
  paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
  subtotal: { type: Number, required: true },
  deliveryFee: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  couponDiscount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  coupon: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
  couponCode: { type: String },
  deliveryZone: { type: mongoose.Schema.Types.ObjectId, ref: "DeliveryZone" },
  deliverySlot: { date: Date, from: String, to: String },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  estimatedDelivery: { type: Date },
  deliveredAt: { type: Date },
  cancelledAt: { type: Date },
  cancellationReason: { type: String },
  trackingHistory: [{
    status: { type: String, required: true },
    note: { type: String },
    timestamp: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  }],
  notes: { type: String },
  loyaltyPointsEarned: { type: Number, default: 0 },
  loyaltyPointsUsed: { type: Number, default: 0 },
  vatAmount: { type: Number, default: 0 },
  invoiceUUID: { type: String },
}, { timestamps: true });

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ user: 1, status: 1 });              // "my orders by status" — very common
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ driver: 1, status: 1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 }); // payment reconciliation
orderSchema.index({ paymentMethod: 1, createdAt: -1 }); // revenue by payment method
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);
