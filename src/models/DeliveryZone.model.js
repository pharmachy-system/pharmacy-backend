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
  // Optional polygon boundary for point-in-polygon zone matching
  polygon: [{
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    _id: false,
  }],
}, { timestamps: true });

deliveryZoneSchema.index({ isActive: 1 });
deliveryZoneSchema.index({ cities: 1 });

module.exports = mongoose.model("DeliveryZone", deliveryZoneSchema);
