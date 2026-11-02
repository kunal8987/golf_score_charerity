const { createService, startService, logger } = require("@dh/shared");
const { createProxyMiddleware } = require("http-proxy-middleware");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const SERVICE = "gateway";
const app = createService(SERVICE, { parseJson: false }); // do not parse bodies: proxy must forward them

app.use(cookieParser());
app.use(rateLimit({ windowMs: 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false }));

// TODO Day 4: verify the JWT here and attach x-user-id / x-user-role headers.
// TODO Day 5: subscription status check for subscriber-only routes.

// Prefix -> service. Express strips the prefix, so services define routes like /signup.
// Service-to-service endpoints must never be reachable from the internet
app.use("/api", (req, res, next) =>
  req.path.includes("/internal/")
    ? res.status(404).json({ success: false, error: { message: "Route not found" } })
    : next()
);

const routes = [
  { prefix: "/api/auth", target: process.env.AUTH_SERVICE_URL || "http://localhost:4001" },
  { prefix: "/api/subscriptions", target: process.env.SUBSCRIPTION_SERVICE_URL || "http://localhost:4002" },
  { prefix: "/api/scores", target: process.env.SCORE_SERVICE_URL || "http://localhost:4003" },
  { prefix: "/api/charities", target: process.env.CHARITY_SERVICE_URL || "http://localhost:4004" },
  { prefix: "/api/draws", target: process.env.DRAW_SERVICE_URL || "http://localhost:4005" },
  { prefix: "/api/winners", target: process.env.WINNER_SERVICE_URL || "http://localhost:4006" },
];

for (const route of routes) {
  app.use(
    route.prefix,
    createProxyMiddleware({
      target: route.target,
      changeOrigin: true,
      xfwd: true, // add X-Forwarded-For so services see the real client IP
      on: {
        error: (err, req, res) => {
          logger.error({ err, target: route.target }, "Upstream service unreachable");
          if (res.status) {
            res.status(502).json({ success: false, error: { message: "Service unavailable" } });
          } else {
            res.end();
          }
        },
      },
    })
  );
}

startService(SERVICE, app, process.env.PORT || 4000).catch((err) => {
  console.error(err);
  process.exit(1);
});
