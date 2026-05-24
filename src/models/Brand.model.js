const mongoose = require("mongoose");
const slugify = require("slugify");

const brandSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  nameAr: { type: String, trim: true },
  slug: { type: String, unique: true },
  description: { type: String, trim: true },
  logo: { type: String },
  country: { type: String, trim: true },
  website: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
}, { timestamps: true });

brandSchema.pre("save", function (next) {
  if (this.isModified("name")) this.slug = slugify(this.name, { lower: true, strict: true });
  next();
});

module.exports = mongoose.model("Brand", brandSchema);
