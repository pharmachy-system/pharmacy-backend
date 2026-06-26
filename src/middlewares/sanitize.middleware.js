// Express 5 compatible NoSQL injection + basic XSS sanitization.
// express-mongo-sanitize mutates req.query in-place which throws in Express 5
// (req.query is a read-only getter). This middleware sanitizes req.body and
// req.params only, which are writable.

const DANGEROUS_KEY = /^\$|\.|\$/; // keys starting with $ or containing .

function sanitizeObject(obj, depth = 0) {
  if (depth > 10 || obj === null || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1));
  }

  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (DANGEROUS_KEY.test(key)) continue; // drop dangerous keys
    clean[key] = typeof value === "object" ? sanitizeObject(value, depth + 1) : value;
  }
  return clean;
}

function sanitizeString(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*on\w+\s*=\s*["'][^"']*["'][^>]*>/gi, "")
    .trim();
}

function sanitizeStrings(obj, depth = 0) {
  if (depth > 10 || obj === null) return obj;
  if (typeof obj === "string") return sanitizeString(obj);
  if (Array.isArray(obj)) return obj.map((i) => sanitizeStrings(i, depth + 1));
  if (typeof obj === "object") {
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
      clean[k] = sanitizeStrings(v, depth + 1);
    }
    return clean;
  }
  return obj;
}

module.exports = function sanitize(req, res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeStrings(sanitizeObject(req.body));
  }
  if (req.params && typeof req.params === "object") {
    req.params = sanitizeObject(req.params);
  }
  next();
};
