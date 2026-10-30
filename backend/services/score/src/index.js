const { createService, startService } = require("@dh/shared");

const SERVICE = "score-service";
const app = createService(SERVICE);

// Day 6: mount this service's routes here, for example:
// app.use(require("./routes"));

startService(SERVICE, app, process.env.PORT || 4003, { mongoUri: process.env.MONGO_URI }).catch((err) => {
  console.error(err);
  process.exit(1);
});
