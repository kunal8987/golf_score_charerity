const { startService, assertAuthConfig, logger } = require("@dh/shared");
const { createApp } = require("./app");

const SERVICE = "gateway";

assertAuthConfig(); // the gateway verifies login tokens, so JWT_SECRET is required
if (!process.env.INTERNAL_API_KEY) {
  logger.warn("INTERNAL_API_KEY is not set. Service-to-service calls and /ops/services will be refused.");
}

startService(SERVICE, createApp(), process.env.PORT || 4000, { expectDb: false }).catch((err) => {
  console.error(err);
  process.exit(1);
});
