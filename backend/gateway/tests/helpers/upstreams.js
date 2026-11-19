// Small fake services. Each one echoes back what the gateway sent it, so tests can check
// exactly which headers and paths were forwarded.
const express = require("express");

const KEPT_HEADERS = ["x-user-id", "x-user-role", "x-request-id", "x-internal-key", "x-forwarded-for", "cookie", "authorization"];

function pick(headers) {
  const out = {};
  for (const name of KEPT_HEADERS) if (headers[name] !== undefined) out[name] = headers[name];
  return out;
}

// state.active: Set of user ids with an active subscription (subscription service only)
// state.down:   make the subscription check fail
// state.slowMs: how long /slow waits before answering
function startUpstream(name, state = {}) {
  const app = express();

  app.get("/internal/access/:userId", (req, res) => {
    state.calls = (state.calls || 0) + 1;
    if (state.down) return res.status(500).json({ success: false });
    return res.json({ success: true, data: { hasAccess: (state.active || new Set()).has(req.params.userId) } });
  });

  app.use((req, res, next) => {
    if (req.path === "/crash") return req.socket.destroy(); // simulates a service dying mid-request
    if (req.path === "/slow") return setTimeout(() => res.json({ service: name, slow: true }), state.slowMs ?? 800);
    return next();
  });

  app.use((req, res) => {
    let bytes = 0;
    req.on("data", (chunk) => (bytes += chunk.length));
    req.on("end", () => {
      res.json({ service: name, method: req.method, path: req.path, headers: pick(req.headers), bodyBytes: bytes });
    });
  });

  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}`, server, state });
    });
  });
}

module.exports = { startUpstream };
