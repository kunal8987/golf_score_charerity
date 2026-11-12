const { startService, assertAuthConfig } = require("@dh/shared");
const { createApp } = require("./app");

const SERVICE = "charity-service";

assertAuthConfig(); // requireAuth needs JWT_SECRET

startService(SERVICE, createApp(), process.env.PORT || 4004, { mongoUri: process.env.MONGO_URI }).catch((err) => {
  console.error(err);
  process.exit(1);
});
