const axios = require("axios");
const { settings } = require("../config");

// The gateway asks the subscription service whether a user is active, and remembers the answer
// for SUBSCRIPTION_CACHE_TTL_MS (default 60 seconds). This keeps the subscription service from
// being asked on every request. The score service still asks on each entry, so a cancellation
// takes effect at once for score entry.
const MAX_ENTRIES = 10000;
const cache = new Map();

async function hasActiveSubscription(userId) {
  const { subscriptionCacheTtlMs } = settings();
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.hasAccess;

  const base = process.env.SUBSCRIPTION_SERVICE_URL || "http://localhost:4002";
  const { data } = await axios.get(`${base}/internal/access/${userId}`, {
    headers: { "x-internal-key": process.env.INTERNAL_API_KEY || "" },
    timeout: 3000,
  });
  const hasAccess = data.data.hasAccess === true;

  if (subscriptionCacheTtlMs > 0) {
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value); // drop the oldest
    cache.set(userId, { hasAccess, expiresAt: Date.now() + subscriptionCacheTtlMs });
  }
  return hasAccess;
}

function clearSubscriptionCache() {
  cache.clear();
}

module.exports = { hasActiveSubscription, clearSubscriptionCache };
