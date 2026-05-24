const mongoose = require("mongoose");

const deliveryZoneSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  nameAr: { type: String, trim: true },
  cities: [String],
  deliveryFee: { type: Number, required: true, default: 0 },
  freeDeliveryThreshold: { type: Number, default: 200 },
  minDeliveryTime: { type: Number, default: 24 },
  maxDeliveryTime: { type: Number, default: 48 },
  isActive: { type: Boolean, default: true },
  slots: [{
    from: { type: String, required: true },
    to: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    maxOrders: { type: Number, default: 50 },
  }],
}, { timestamps: true });

module.exports = mongoose.model("DeliveryZone", deliveryZoneSchema);
