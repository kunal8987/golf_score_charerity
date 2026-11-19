const { AppError, extractToken, verifyToken, logger } = require("@dh/shared");
const { resolveAccess } = require("../accessRules");
const { hasActiveSubscription } = require("../services/subscriptionCache");

// Checks the caller against the access rules for this route. On success it sets req.user,
// which the proxy turns into the x-user-id and x-user-role headers for the service.
function accessGate(serviceName) {
  return async (req, res, next) => {
    const access = resolveAccess(serviceName, req.method, req.path);
    if (access === "public") return next();

    const token = extractToken(req);
    if (!token) return next(new AppError("Authentication required", 401));

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return next(new AppError("Invalid or expired session", 401));
    }
    req.user = { id: payload.sub, role: payload.role };

    if (access === "admin" && req.user.role !== "admin") {
      return next(new AppError("You do not have permission to do this", 403));
    }

    if (access === "subscriber") {
      let active;
      try {
        active = await hasActiveSubscription(req.user.id);
      } catch (err) {
        logger.error({ err }, "Subscription check failed at the gateway");
        return next(new AppError("We could not confirm your subscription. Please try again shortly.", 503, true));
      }
      if (!active) return next(new AppError("An active subscription is required", 403));
    }
    return next();
  };
}

module.exports = { accessGate };
