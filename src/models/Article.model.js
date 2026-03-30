const mongoose = require("mongoose");
const slugify = require("slugify");

const articleSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  titleAr: { type: String, trim: true },
  slug: { type: String, unique: true },
  content: { type: String, required: true },
  excerpt: { type: String, trim: true, maxlength: 300 },
  image: { url: String, public_id: String },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  category: { type: String, enum: ["health_tips", "medicine_info", "nutrition", "wellness", "news"], default: "health_tips" },
  tags: [String],
  status: { type: String, enum: ["draft", "published"], default: "draft" },
  publishedAt: { type: Date },
  views: { type: Number, default: 0 },
  isFeatured: { type: Boolean, default: false },
}, { timestamps: true });

// slug index created by unique: true above
articleSchema.index({ status: 1, publishedAt: -1 });

articleSchema.pre("save", function (next) {
  if (this.isModified("title")) {
    this.slug = slugify(this.title + "-" + Date.now(), { lower: true, strict: true });
  }
  if (this.status === "published" && !this.publishedAt) this.publishedAt = new Date();
  next();
});

module.exports = mongoose.model("Article", articleSchema);
