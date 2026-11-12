const Donation = require("../models/Donation");
const { getStripe } = require("../services/stripe");

// Receives donation events from Stripe. This needs its own endpoint and signing secret,
// separate from the subscription webhook (see README).
exports.webhook = async (req, res) => {
  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_DONATION_WEBHOOK_SECRET
    );
  } catch {
    return res.status(400).json({ success: false, error: { message: "Invalid webhook signature" } });
  }

  const session = event.data?.object;
  const isDonation = session?.metadata?.type === "donation";

  if (isDonation && (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded")) {
    if (session.payment_status === "paid") {
      // Only moves pending to completed, so a repeated delivery changes nothing
      await Donation.findOneAndUpdate(
        { _id: session.metadata.donationId, status: "pending" },
        { $set: { status: "completed", completedAt: new Date() } }
      );
    }
  } else if (isDonation && event.type === "checkout.session.expired") {
    await Donation.findOneAndUpdate(
      { _id: session.metadata.donationId, status: "pending" },
      { $set: { status: "failed" } }
    );
  }

  return res.json({ received: true });
};
