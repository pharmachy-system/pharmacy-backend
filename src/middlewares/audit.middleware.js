const AuditLog = require("../models/AuditLog.model");

/**
 * Returns Express middleware that writes an audit log entry after the response.
 *
 * Usage:
 *   router.delete("/:id", protect, authorize("admin"), audit("DELETE", "Medicine"), deleteMedicine);
 *
 * The log is written asynchronously via setImmediate so it never blocks the response.
 */
function audit(action, resource) {
  return (req, res, next) => {
    const startedAt = Date.now();

    const originalJson = res.json.bind(res);
    res.json = function (data) {
      const result = originalJson(data);

      setImmediate(() => {
        AuditLog.create({
          actor:      req.user?._id,
          actorEmail: req.user?.email,
          actorRole:  req.user?.role,
          action,
          resource,
          resourceId: req.params?.id || data?._id || data?.data?._id,
          changes:    summariseChanges(req.body),
          ip:         req.ip,
          userAgent:  req.headers["user-agent"],
          requestId:  req.id,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
        }).catch(() => {});
      });

      return result;
    };

    next();
  };
}

function summariseChanges(body) {
  if (!body || typeof body !== "object") return undefined;
  const keys = Object.keys(body);
  if (!keys.length) return undefined;
  // Store field names changed; truncate large values for storage efficiency
  return keys.reduce((acc, k) => {
    const v = body[k];
    acc[k] = typeof v === "string" && v.length > 200 ? v.slice(0, 200) + "…" : v;
    return acc;
  }, {});
}

module.exports = { audit };
