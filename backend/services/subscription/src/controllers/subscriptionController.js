const Subscription = require("../models/Subscription");
const { AppError } = require("@dh/shared");
const { getStripe, priceIdForPlan, applyStripeSubscription } = require("../services/stripe");

const clientUrl = () => process.env.CLIENT_URL || "http://localhost:3000";

function summary(sub) {
  return {
    status: sub?.status ?? "inactive",
    plan: sub?.plan ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
  };
}

exports.checkout = async (req, res) => {
  const userId = req.user.id;
  const priceId = priceIdForPlan(req.body.plan);

  const existing = await Subscription.findOne({ userId });
  if (existing?.status === "active") {
    throw new AppError("You already have an active subscription", 409);
  }

  const stripe = getStripe();
  let customerId = existing?.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ metadata: { userId } });
    customerId = customer.id;
    await Subscription.findOneAndUpdate({ userId }, { $set: { stripeCustomerId: customerId } }, { upsert: true });
  }

  // Stripe Checkout hosts the card form, so card data never touches our servers (PCI scope)
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userId,
    subscription_data: { metadata: { userId } },
    success_url: `${clientUrl()}/dashboard?subscription=success`,
    cancel_url: `${clientUrl()}/subscribe?cancelled=true`,
  });

  res.status(201).json({ success: true, data: { url: session.url } });
};

exports.status = async (req, res) => {
  const sub = await Subscription.findOne({ userId: req.user.id });
  res.json({ success: true, data: { subscription: summary(sub) } });
};

exports.cancel = async (req, res) => {
  const sub = await Subscription.findOne({ userId: req.user.id });
  if (!sub?.stripeSubscriptionId || sub.status !== "active") {
    throw new AppError("You have no active subscription to cancel", 400);
  }
  if (sub.cancelAtPeriodEnd) throw new AppError("Your subscription is already set to end", 400);

  // Cancel at period end: the user keeps access until the paid period finishes
  const updated = await getStripe().subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
  const saved = await applyStripeSubscription(updated);
  res.json({ success: true, data: { subscription: summary(saved) } });
};

exports.resume = async (req, res) => {
  const sub = await Subscription.findOne({ userId: req.user.id });
  if (!sub?.stripeSubscriptionId || !sub.cancelAtPeriodEnd) {
    throw new AppError("There is no pending cancellation to undo", 400);
  }
  const updated = await getStripe().subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: false });
  const saved = await applyStripeSubscription(updated);
  res.json({ success: true, data: { subscription: summary(saved) } });
};

// Called by other services (for example the score service) before allowing subscriber actions
exports.internalAccess = async (req, res) => {
  const sub = await Subscription.findOne({ userId: req.params.userId });
  res.json({ success: true, data: { hasAccess: sub?.status === "active" } });
};

exports.adminList = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const filter = {};
  if (["inactive", "active", "lapsed", "cancelled"].includes(req.query.status)) {
    filter.status = req.query.status;
  }

  const [subscriptions, total] = await Promise.all([
    Subscription.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Subscription.countDocuments(filter),
  ]);
  res.json({ success: true, data: { subscriptions, page, limit, total } });
};
