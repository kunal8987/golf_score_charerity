const pino = require("pino");
const pinoHttp = require("pino-http");

// Secrets must never reach the logs. Anything in this list is replaced with [Redacted].
const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-internal-key"]',
  'req.headers["stripe-signature"]',
  "res.headers['set-cookie']",
];

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: { paths: REDACT_PATHS, censor: "[Redacted]" },
});

// Only log the request basics, not every header
const requestLogger = pinoHttp({
  logger,
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url, remoteAddress: req.remoteAddress }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

module.exports = { logger, requestLogger };
