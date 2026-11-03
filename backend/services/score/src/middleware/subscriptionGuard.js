const { AppError, logger } = require("@dh/shared");
const { hasActiveSubscription } = require("../services/subscriptionClient");

// PRD 04: non-subscribers get restricted access. Must run after requireAuth.
async function requireActiveSubscription(req, res, next) {
  let allowed;
  try {
    allowed = await hasActiveSubscription(req.user.id);
  } catch (err) {
    logger.error({ err }, "Subscription check failed");
    return next(new AppError("We could not confirm your subscription. Please try again shortly.", 503, true));
  }
  if (!allowed) {
    return next(new AppError("An active subscription is required to enter scores", 403));
  }
  return next();
}

module.exports = { requireActiveSubscription };
