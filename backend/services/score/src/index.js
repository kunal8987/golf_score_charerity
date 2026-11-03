const { startService, assertAuthConfig } = require("@dh/shared");
const { createApp } = require("./app");

const SERVICE = "score-service";

assertAuthConfig(); // requireAuth needs JWT_SECRET

startService(SERVICE, createApp(), process.env.PORT || 4003, { mongoUri: process.env.MONGO_URI }).catch((err) => {
  console.error(err);
  process.exit(1);
});
