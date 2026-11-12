const Stripe = require("stripe");
const { AppError, logger } = require("@dh/shared");

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

module.exports = { getStripe };
