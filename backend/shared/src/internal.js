const crypto = require("crypto");
const { AppError } = require("./errors");

// Protects service-to-service endpoints (paths containing /internal/).
// The gateway blocks those paths from the public internet, and this check
// stops any other caller that reaches a service directly.
function requireInternalKey(req, res, next) {
  const expected = process.env.INTERNAL_API_KEY || "";
  const provided = req.get("x-internal-key") || "";
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  const ok = expected.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return next(new AppError("Forbidden", 403));
  return next();
}

module.exports = { requireInternalKey };
