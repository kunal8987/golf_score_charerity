const axios = require("axios");

// Returns the user ids of every subscriber whose subscription is active.
async function fetchActiveSubscriberIds() {
  const base = process.env.SUBSCRIPTION_SERVICE_URL || "http://localhost:4002";
  const { data } = await axios.get(`${base}/internal/subscribers/active`, {
    headers: { "x-internal-key": process.env.INTERNAL_API_KEY || "" },
    timeout: 10000,
  });
  return data.data.userIds;
}

module.exports = { fetchActiveSubscriberIds };
