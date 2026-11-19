const { createProxyMiddleware } = require("http-proxy-middleware");
const { logger } = require("@dh/shared");
const { settings } = require("./config");

const TIMEOUT_CODES = ["ETIMEDOUT", "ECONNABORTED", "ESOCKETTIMEDOUT"];

function isTimeout(err) {
  return TIMEOUT_CODES.includes(err.code) || /timed? ?out/i.test(err.message || "");
}

// Forwards /api/<name>/... to the service, with the caller's identity set by the gateway.
function buildProxy(service) {
  const { proxyTimeoutMs } = settings();
  return createProxyMiddleware({
    target: service.target(),
    changeOrigin: true,
    xfwd: true, // X-Forwarded-For, so services see the real client address
    on: {
      proxyReq: (proxyReq, req) => {
        // Give up on a silent service. Destroying with a timeout error sends it through the
        // error handler below, which answers 504. (The library's own timeout option did not
        // surface an error, so the client saw a dropped connection.)
        proxyReq.setTimeout(proxyTimeoutMs, () => {
          proxyReq.destroy(Object.assign(new Error("Upstream request timed out"), { code: "ETIMEDOUT" }));
        });
        // The gateway sets these; clients cannot (they are stripped on arrival)
        if (req.user) {
          proxyReq.setHeader("x-user-id", req.user.id);
          proxyReq.setHeader("x-user-role", req.user.role);
        }
      },
      error: (err, req, res) => {
        const status = isTimeout(err) ? 504 : 502;
        logger.error({ err, service: service.name, status }, "Upstream request failed");
        if (res.headersSent || typeof res.status !== "function") return;
        res.status(status).json({
          success: false,
          error: {
            message: status === 504 ? "The service took too long to respond" : "Service unavailable",
          },
        });
      },
    },
  });
}

module.exports = { buildProxy, isTimeout };
