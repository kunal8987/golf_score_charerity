const cookieParser = require("cookie-parser");
const { createService } = require("@dh/shared");
const routes = require("./routes");

// Builds the Express app without starting it, so tests can use it directly.
function createApp() {
  const app = createService("score-service");
  app.set("trust proxy", 1);
  app.use(cookieParser());
  app.use(routes);
  return app;
}

module.exports = { createApp };
