// Who may call each route. The first matching rule wins; anything not matched gets the
// service's default. The default is "auth" (login required), so a new route is protected
// until someone decides otherwise.
//
// Levels:
//   public     anyone, no login
//   auth       any logged-in user
//   subscriber logged in AND an active subscription (checked and cached here)
//   admin      logged in with role "admin"
//
// Paths are matched against the part after /api/<service>, for example "/admin/draws".
const HEALTH = { method: "GET", path: /^\/health$/, access: "public" };
const ADMIN_ONLY = { path: /^\/admin(\/|$)/, access: "admin" };

const RULES = {
  auth: {
    default: "auth",
    rules: [
      HEALTH,
      { method: "POST", path: /^\/(signup|login|logout)$/, access: "public" },
      { path: /^\/users(\/|$)/, access: "admin" },
    ],
  },
  subscriptions: {
    default: "auth",
    rules: [
      HEALTH,
      { method: "POST", path: /^\/webhook$/, access: "public" }, // Stripe, verified by signature
      ADMIN_ONLY,
    ],
  },
  scores: {
    default: "subscriber",
    rules: [HEALTH, ADMIN_ONLY],
  },
  charities: {
    default: "auth",
    rules: [
      HEALTH,
      { method: "GET", path: /^\/$/, access: "public" }, // directory
      { method: "GET", path: /^\/spotlight$/, access: "public" },
      { method: "GET", path: /^\/[a-f\d]{24}$/i, access: "public" }, // one charity's profile
      { method: "POST", path: /^\/webhook$/, access: "public" }, // Stripe, verified by signature
      ADMIN_ONLY,
    ],
  },
  draws: {
    default: "auth",
    rules: [HEALTH, ADMIN_ONLY],
  },
  winners: {
    default: "auth",
    rules: [HEALTH, ADMIN_ONLY],
  },
};

// Returns "public" | "auth" | "subscriber" | "admin"
function resolveAccess(serviceName, method, subpath) {
  const config = RULES[serviceName];
  if (!config) return "admin"; // unknown service: refuse everything
  const m = String(method).toUpperCase();
  for (const rule of config.rules) {
    if (rule.method && rule.method !== m) continue;
    if (rule.path.test(subpath)) return rule.access;
  }
  return config.default;
}

module.exports = { RULES, resolveAccess };
