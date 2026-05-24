/**
 * Cloudinary Utility — image upload and deletion via multer memory storage.
 *
 * Files are received as memory buffers by multer, then streamed directly
 * to Cloudinary so no temporary disk files are created.
 *
 * Env vars required: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 */

// Third-party
const cloudinary = require("cloudinary").v2;
const multer     = require("multer");

// Local
const logger = require("../config/logger.config");

// ─── Cloudinary config ────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Multer: memory storage (no disk writes) ──────────────────────────────────
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
};

/** Multer middleware — attach to routes that accept image uploads. */
exports.upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// ─── Upload ───────────────────────────────────────────────────────────────────
/**
 * Stream a Buffer to Cloudinary.
 * @param {Buffer} buffer   File buffer from multer
 * @param {string} folder   Sub-folder under "pharmacy/" (e.g. "medicines")
 * @param {object} options  Extra Cloudinary upload options
 * @returns {Promise<object>} Cloudinary upload result ({ url, public_id, … })
 */
exports.uploadToCloudinary = (buffer, folder, options = {}) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `pharmacy/${folder}`, resource_type: "image", ...options },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(buffer);
  });

// ─── Delete ───────────────────────────────────────────────────────────────────
/**
 * Delete an image from Cloudinary by its public_id.
 * Non-critical — logs the error but does not throw.
 * @param {string} publicId
 */
exports.deleteFromCloudinary = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    logger.warn(`Cloudinary delete failed for "${publicId}": ${err.message}`);
  }
};
