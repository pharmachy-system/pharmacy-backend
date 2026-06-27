const Article = require("../models/Article.model");
const { uploadToCloudinary, deleteFromCloudinary } = require("../utils/cloudinary.util");

exports.getAllArticles = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const filter = { status: "published" };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.featured === "true") filter.isFeatured = true;
    if (req.query.tag) filter.tags = req.query.tag;
    if (req.query.search) {
      const escaped = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { title: { $regex: escaped, $options: "i" } },
        { excerpt: { $regex: escaped, $options: "i" } },
      ];
    }

    const [articles, total] = await Promise.all([
      Article.find(filter)
        .populate("author", "name avatar")
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-content"),
      Article.countDocuments(filter),
    ]);

    res.json({ success: true, articles, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

exports.getArticleBySlug = async (req, res, next) => {
  try {
    const article = await Article.findOne({ slug: req.params.slug, status: "published" }).populate(
      "author",
      "name avatar"
    );
    if (!article) return res.status(404).json({ success: false, message: "Article not found" });

    Article.findByIdAndUpdate(article._id, { $inc: { views: 1 } }).exec();
    res.json({ success: true, article });
  } catch (err) {
    next(err);
  }
};

exports.getArticleById = async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id).populate("author", "name avatar");
    if (!article) return res.status(404).json({ success: false, message: "Article not found" });
    res.json({ success: true, article });
  } catch (err) {
    next(err);
  }
};

exports.createArticle = async (req, res, next) => {
  try {
    const article = await Article.create({ ...req.body, author: req.user._id });

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "articles");
      article.image = { url: result.secure_url, public_id: result.public_id };
      await article.save();
    }

    res.status(201).json({ success: true, article });
  } catch (err) {
    next(err);
  }
};

exports.updateArticle = async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ success: false, message: "Article not found" });

    if (req.file) {
      if (article.image?.public_id) await deleteFromCloudinary(article.image.public_id);
      const result = await uploadToCloudinary(req.file.buffer, "articles");
      req.body.image = { url: result.secure_url, public_id: result.public_id };
    }

    Object.assign(article, req.body);
    await article.save();
    res.json({ success: true, article });
  } catch (err) {
    next(err);
  }
};

exports.deleteArticle = async (req, res, next) => {
  try {
    const article = await Article.findByIdAndDelete(req.params.id);
    if (!article) return res.status(404).json({ success: false, message: "Article not found" });
    if (article.image?.public_id) await deleteFromCloudinary(article.image.public_id);
    res.json({ success: true, message: "Article deleted" });
  } catch (err) {
    next(err);
  }
};
