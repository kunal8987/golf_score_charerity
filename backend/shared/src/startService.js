const { logger } = require("./logger");
const { connectDb } = require("./db");
const { notFound, errorHandler } = require("./errors");

// Call AFTER all routes are mounted, so 404 and error handlers come last.
async function startService(name, app, port, { mongoUri } = {}) {
  if (mongoUri) {
    await connectDb(mongoUri, name);
  } else {
    logger.warn(`${name}: MONGO_URI not set, running without a database`);
  }

  app.use(notFound);
  app.use(errorHandler);

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      logger.info(`${name} listening on port ${port}`);
      resolve(server);
    });
  });
}

module.exports = { startService };
