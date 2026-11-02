const { getStripe, syncSubscription } = require("../services/stripe");

// Stripe calls this endpoint. It must receive the RAW body to verify the signature.
exports.webhook = async (req, res) => {
  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return res.status(400).json({ success: false, error: { message: "Invalid webhook signature" } });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "subscription" && session.subscription) {
        await syncSubscription(session.subscription);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object.id);
      break;
    default:
      break; // other events are ignored
  }

  // Any thrown error returns 500, so Stripe retries the event later
  return res.json({ received: true });
};
