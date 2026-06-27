const mongoose = require("mongoose");
const slugify = require("slugify");

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  nameAr: { type: String, trim: true },
  slug: { type: String, unique: true },
  description: { type: String, trim: true },
  image: { type: String },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

categorySchema.virtual("subcategories", { ref: "Category", localField: "_id", foreignField: "parent" });
// slug index created by unique: true above
categorySchema.index({ parent: 1 });
categorySchema.index({ isActive: 1, isFeatured: 1 }); // active category listing

categorySchema.pre("save", function (next) {
  if (this.isModified("name")) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

module.exports = mongoose.model("Category", categorySchema);
