const { createService, startService } = require("@dh/shared");

const SERVICE = "draw-service";
const app = createService(SERVICE);

// Day 8: mount this service's routes here, for example:
// app.use(require("./routes"));

startService(SERVICE, app, process.env.PORT || 4005, { mongoUri: process.env.MONGO_URI }).catch((err) => {
  console.error(err);
  process.exit(1);
});
