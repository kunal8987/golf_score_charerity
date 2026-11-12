const express = require("express");
const cookieParser = require("cookie-parser");
const { createService } = require("@dh/shared");
const routes = require("./routes");
const { webhook } = require("./controllers/webhookController");

// Builds the Express app without starting it, so tests can use it directly.
function createApp() {
  // parseJson: false, because the Stripe webhook needs the raw body
  const app = createService("charity-service", { parseJson: false });
  app.set("trust proxy", 1);
  app.use(cookieParser());

  app.post("/webhook", express.raw({ type: "application/json" }), webhook);

  app.use(express.json({ limit: "1mb" }));
  app.use(routes);
  return app;
}

module.exports = { createApp };
