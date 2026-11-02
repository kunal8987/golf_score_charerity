const Stripe = require("stripe");
const { AppError, logger } = require("@dh/shared");
const Subscription = require("../models/Subscription");

let client = null;

function getStripe() {
  if (!client) {
    if (!process.env.STRIPE_SECRET_KEY) {
      logger.error("STRIPE_SECRET_KEY is not set");
      throw new AppError("Payments are not configured", 500);
    }
    client = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return client;
}

const prices = () => ({
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  yearly: process.env.STRIPE_PRICE_YEARLY,
});

function priceIdForPlan(plan) {
  const priceId = prices()[plan];
  if (!priceId) throw new AppError("This plan is not available yet", 503);
  return priceId;
}

function planFromPriceId(priceId) {
  const map = prices();
  return Object.keys(map).find((plan) => map[plan] && map[plan] === priceId) || null;
}

// Stripe status -> our status (PRD 04: active, inactive, renewal, cancellation, lapsed)
function mapStatus(stripeStatus) {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
    case "paused":
      return "lapsed";
    case "canceled":
      return "cancelled";
    default: // incomplete, incomplete_expired
      return "inactive";
  }
}

function periodEnd(sub) {
  // Newer Stripe API versions moved current_period_end onto the subscription item
  const seconds = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  return seconds ? new Date(seconds * 1000) : null;
}

// Writes the local copy of a Stripe subscription. Safe to run more than once.
async function applyStripeSubscription(sub) {
  const userId = sub.metadata?.userId;
  const fields = {
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
    stripeSubscriptionId: sub.id,
    plan: planFromPriceId(sub.items?.data?.[0]?.price?.id),
    status: mapStatus(sub.status),
    currentPeriodEnd: periodEnd(sub),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
  };

  if (userId) {
    return Subscription.findOneAndUpdate({ userId }, { $set: fields }, { upsert: true, new: true });
  }
  // Fallback: find the user by Stripe customer id
  const existing = await Subscription.findOneAndUpdate(
    { stripeCustomerId: fields.stripeCustomerId },
    { $set: fields },
    { new: true }
  );
  if (!existing) logger.warn({ subscriptionId: sub.id }, "Stripe subscription has no matching user; ignored");
  return existing;
}

// Always re-reads the subscription from Stripe instead of trusting the webhook payload.
// This avoids applying an old event after a newer one.
async function syncSubscription(stripeSubscriptionId) {
  const sub = await getStripe().subscriptions.retrieve(stripeSubscriptionId);
  return applyStripeSubscription(sub);
}

module.exports = {
  getStripe,
  priceIdForPlan,
  planFromPriceId,
  mapStatus,
  applyStripeSubscription,
  syncSubscription,
};
