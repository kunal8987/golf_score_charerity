const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const axios = require("axios");
const { createService, requireInternalKey } = require("@dh/shared");
const { SERVICES, settings } = require("./config");
const { cleanClientHeaders, blockInternal, enforceBodyLimit } = require("./middleware/security");
const { accessGate } = require("./middleware/access");
const { buildProxy } = require("./proxy");

// Ops view: is each service answering? Needs the internal key, so it is not public.
async function serviceStatus(service) {
  const started = Date.now();
  try {
    await axios.get(`${service.target()}/health`, { timeout: 2000 });
    return { service: service.name, status: "up", latencyMs: Date.now() - started };
  } catch {
    return { service: service.name, status: "down", latencyMs: null };
  }
}

// Builds the gateway. Does not start listening, so tests can call it directly.
function createApp() {
  // No body parsing: request bodies (including file uploads) are streamed through unchanged
  const app = createService("gateway", { parseJson: false });
  app.set("trust proxy", 1); // the platform sits in front of us, so take the real client IP from it

  app.use(cookieParser());

  // Per client IP. Webhooks are skipped: Stripe sends them in bursts, and they are signed.
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: () => settings().rateLimitPerMin,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.path.endsWith("/webhook"),
      message: { success: false, error: { message: "Too many requests. Please slow down." } },
    })
  );

  app.get("/ops/services", requireInternalKey, async (req, res) => {
    const services = await Promise.all(SERVICES.map(serviceStatus));
    res.json({ success: true, data: { services } });
  });

  // Order matters: clean headers, refuse internal paths, check who is calling, check size, forward
  app.use("/api", cleanClientHeaders, blockInternal);
  for (const service of SERVICES) {
    app.use(
      `/api/${service.name}`,
      accessGate(service.name),
      enforceBodyLimit(service.name),
      buildProxy(service)
    );
  }
  return app;
}

module.exports = { createApp };
