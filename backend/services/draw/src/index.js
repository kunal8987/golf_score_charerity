const { startService, assertAuthConfig, logger } = require("@dh/shared");
const { createApp } = require("./app");
const { startMonthlyJob } = require("./jobs/monthlyDraw");

const SERVICE = "draw-service";

assertAuthConfig(); // requireAuth needs JWT_SECRET

startService(SERVICE, createApp(), process.env.PORT || 4005, { mongoUri: process.env.MONGO_URI })
  .then(() => {
    // Only one instance should run the monthly job. Turn it on for that instance only.
    if (process.env.ENABLE_DRAW_SCHEDULER === "true") {
      startMonthlyJob();
      logger.info("Monthly draw scheduler started (Asia/Kolkata)");
    }
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
