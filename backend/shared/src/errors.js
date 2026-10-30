const { logger } = require("./logger");

// Throw this from controllers: throw new AppError("Score must be 1-45", 400)
class AppError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
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
  res.status(status).json({
    success: false,
    error: { message: status >= 500 ? "Internal server error" : err.message },
  });
}

module.exports = { AppError, notFound, errorHandler };
