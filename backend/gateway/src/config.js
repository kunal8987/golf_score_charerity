// Gateway settings. Values are read from the environment when the gateway starts (or, for the
// limits, on each request), so tests and deployments can change them.
const MB = 1024 * 1024;

// Each public route prefix (/api/<name>) and the service it forwards to
const SERVICES = [
  { name: "auth", target: () => process.env.AUTH_SERVICE_URL || "http://localhost:4001" },
  { name: "subscriptions", target: () => process.env.SUBSCRIPTION_SERVICE_URL || "http://localhost:4002" },
  { name: "scores", target: () => process.env.SCORE_SERVICE_URL || "http://localhost:4003" },
  { name: "charities", target: () => process.env.CHARITY_SERVICE_URL || "http://localhost:4004" },
  { name: "draws", target: () => process.env.DRAW_SERVICE_URL || "http://localhost:4005" },
  { name: "winners", target: () => process.env.WINNER_SERVICE_URL || "http://localhost:4006" },
];

// Largest request body accepted for each route. Everything else is 1 MB.
// The proof upload allows 6 MB: the 5 MB file plus the multipart envelope.
const DEFAULT_BODY_LIMIT = 1 * MB;
const BODY_LIMITS = [{ service: "winners", method: "POST", path: /\/proof$/, bytes: 6 * MB }];

function bodyLimitFor(serviceName, method, subpath) {
  const rule = BODY_LIMITS.find((r) => r.service === serviceName && r.method === method && r.path.test(subpath));
  return rule ? rule.bytes : DEFAULT_BODY_LIMIT;
}

function settings() {
  return {
    proxyTimeoutMs: Number(process.env.PROXY_TIMEOUT_MS || 15000),
    rateLimitPerMin: Number(process.env.GATEWAY_RATE_LIMIT_PER_MIN || 120),
    subscriptionCacheTtlMs: Number(process.env.SUBSCRIPTION_CACHE_TTL_MS || 60000),
  };
}

module.exports = { SERVICES, DEFAULT_BODY_LIMIT, bodyLimitFor, settings };
