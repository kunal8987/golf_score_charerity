const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const { requestLogger } = require("./logger");

// Builds an Express app with the common middleware every service needs.
// parseJson: false for the gateway, because it must forward the raw body.
function createService(name, { parseJson = true } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000", credentials: true }));
  app.use(requestLogger);
  if (parseJson) app.use(express.json({ limit: "1mb" }));

  app.get("/health", (req, res) => {
    res.json({ success: true, data: { service: name, status: "ok", uptime: process.uptime() } });
  });

  return app;
}

module.exports = { createService };
