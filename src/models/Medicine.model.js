const mongoose = require("mongoose");
const slugify = require("slugify");

const medicineSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  nameAr: { type: String, trim: true },
  slug: { type: String, unique: true },
  description: { type: String, trim: true },
  shortDescription: { type: String, trim: true },
  images: [{ url: String, public_id: String, isMain: { type: Boolean, default: false } }],
  category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
  subcategory: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
  brand: { type: mongoose.Schema.Types.ObjectId, ref: "Brand" },
  price: { type: Number, required: true, min: 0 },
  comparePrice: { type: Number, min: 0 },
  discount: { type: Number, default: 0, min: 0, max: 100 },
  finalPrice: { type: Number, min: 0 },
  stock: { type: Number, required: true, default: 0, min: 0 },
  lowStockThreshold: { type: Number, default: 10 },
  sku: { type: String, trim: true, unique: true, sparse: true },
  barcode: { type: String, trim: true, unique: true, sparse: true },
  requiresPrescription: { type: Boolean, default: false },
  dosageForm: { type: String, enum: ["tablet", "capsule", "syrup", "injection", "cream", "drops", "inhaler", "patch", "other"] },
  strength: { type: String, trim: true },
  usage: { type: String, trim: true },
  sideEffects: { type: String, trim: true },
  warnings: { type: String, trim: true },
  ingredients: [{ type: String, trim: true }],
  storageConditions: { type: String, trim: true },
  expiryDate: { type: Date },
  manufacturer: { type: String, trim: true },
  countryOfOrigin: { type: String, trim: true },
  tags: [String],
  alternatives: [{ type: mongoose.Schema.Types.ObjectId, ref: "Medicine" }],
  relatedMedicines: [{ type: mongoose.Schema.Types.ObjectId, ref: "Medicine" }],
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  isFlashSale: { type: Boolean, default: false },
  flashSalePrice: { type: Number },
  flashSaleEnd: { type: Date },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0 },
  soldCount: { type: Number, default: 0 },
  viewCount: { type: Number, default: 0 },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

medicineSchema.index({ name: "text", nameAr: "text", description: "text", tags: "text" });
medicineSchema.index({ category: 1, isActive: 1 });
medicineSchema.index({ brand: 1, isActive: 1 });
medicineSchema.index({ finalPrice: 1, isActive: 1 });
medicineSchema.index({ isFlashSale: 1, flashSaleEnd: 1, isActive: 1 });
medicineSchema.index({ isFeatured: 1, isActive: 1 });
medicineSchema.index({ soldCount: -1 });

medicineSchema.virtual("isLowStock").get(function () { return this.stock > 0 && this.stock <= this.lowStockThreshold; });
medicineSchema.virtual("isOutOfStock").get(function () { return this.stock === 0; });
medicineSchema.virtual("isExpired").get(function () { return this.expiryDate ? this.expiryDate < new Date() : false; });

medicineSchema.pre("save", function (next) {
  if (this.isModified("name") || !this.slug) {
    this.slug = slugify(this.name + "-" + Date.now(), { lower: true, strict: true });
  }
  this.finalPrice = this.discount > 0
    ? parseFloat((this.price * (1 - this.discount / 100)).toFixed(2))
    : this.price;
  next();
});

module.exports = mongoose.model("Medicine", medicineSchema);
