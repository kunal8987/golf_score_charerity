const axios = require("axios");

// Asks the subscription service whether a user may enter scores.
// Throws if the subscription service cannot be reached (the guard then fails closed).
async function hasActiveSubscription(userId) {
  const base = process.env.SUBSCRIPTION_SERVICE_URL || "http://localhost:4002";
  const { data } = await axios.get(`${base}/internal/access/${userId}`, {
    headers: { "x-internal-key": process.env.INTERNAL_API_KEY || "" },
    timeout: 3000,
  });
  return data.data.hasAccess === true;
}

module.exports = { hasActiveSubscription };
