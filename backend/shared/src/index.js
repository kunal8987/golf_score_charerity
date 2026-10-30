// Load the root .env once, for every service that requires @dh/shared
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const { createService } = require("./createService");
const { startService } = require("./startService");
const { logger, requestLogger } = require("./logger");
const { AppError, notFound, errorHandler } = require("./errors");
const { connectDb } = require("./db");
const { validate } = require("./validate");
const {
  COOKIE_NAME,
  assertAuthConfig,
  signToken,
  verifyToken,
  cookieOptions,
  requireAuth,
  requireRole,
} = require("./auth");

module.exports = {
  createService,
  startService,
  logger,
  requestLogger,
  AppError,
  notFound,
  errorHandler,
  connectDb,
  validate,
  COOKIE_NAME,
  assertAuthConfig,
  signToken,
  verifyToken,
  cookieOptions,
  requireAuth,
  requireRole,
};
