/**
 * Lightweight in-memory response cache.
 *
 * Designed for read-heavy public endpoints (/api/app/home, /api/categories, etc.)
 * where the response changes infrequently and DB queries are expensive.
 *
 * This is an intentional starting point — the Map-based store can be swapped for
 * Redis by replacing get/set/del calls without changing any callers.
 *
 * Usage:
 *   router.get("/", cache(60), myController);          // 60-second TTL
 *   invalidateCachePrefix("/api/categories");          // bust on write
 */

const store = new Map(); // { key → { value, expiresAt } }

// ─── Core store operations ────────────────────────────────────────────────────

function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) { store.delete(key); return null; }
  return entry.value;
}

function cacheSet(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function invalidateCachePrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

// ─── Express middleware factory ───────────────────────────────────────────────

/**
 * @param {number} ttlSeconds — Cache duration in seconds
 * @param {(req) => string} [keyFn] — Custom cache-key function; defaults to req.originalUrl
 */
function cache(ttlSeconds, keyFn) {
  return (req, res, next) => {
    if (req.method !== "GET") return next();

    const key = keyFn ? keyFn(req) : req.originalUrl;
    const cached = cacheGet(key);

    if (cached) {
      res.setHeader("X-Cache", "HIT");
      res.setHeader("Content-Type", "application/json");
      return res.send(cached);
    }

    res.setHeader("X-Cache", "MISS");

    const originalJson = res.json.bind(res);
    res.json = function (data) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cacheSet(key, JSON.stringify(data), ttlSeconds * 1000);
      }
      res.json = originalJson;
      return originalJson(data);
    };

    next();
  };
}

// ─── Periodic cleanup (prevent unbounded growth) ──────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt < now) store.delete(key);
  }
}, 60_000).unref();

module.exports = { cache, invalidateCachePrefix, cacheGet, cacheSet };
