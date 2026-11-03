const { logger } = require("./logger");

// Throw from controllers: throw new AppError("Score must be 1-45", 400)
// 4xx messages are always shown. 5xx messages are hidden unless expose is true.
class AppError extends Error {
  constructor(message, status = 500, expose) {
    super(message);
    this.status = status;
    this.expose = expose ?? status < 500;
  }
}

function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: { message: `Route not found: ${req.method} ${req.originalUrl}` },
  });
}

// Must be the last middleware. Never send stack traces to clients.
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) {
    logger.error({ err }, "Unhandled error");
  }
  if (res.headersSent) return next(err);
  const exposeMessage = err.expose ?? status < 500;
  res.status(status).json({
    success: false,
    error: { message: exposeMessage ? err.message : "Internal server error" },
  });
}

module.exports = { AppError, notFound, errorHandler };
