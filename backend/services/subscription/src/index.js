const { createService, startService } = require("@dh/shared");

const SERVICE = "subscription-service";
const app = createService(SERVICE);

// Day 5: mount this service's routes here, for example:
// app.use(require("./routes"));

startService(SERVICE, app, process.env.PORT || 4002, { mongoUri: process.env.MONGO_URI }).catch((err) => {
  console.error(err);
  process.exit(1);
});
