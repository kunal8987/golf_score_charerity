// Load the root .env once, for every service that requires @dh/shared
require("dotenv").config({ path: require("path").join(__dirname, "../../.env"), quiet: true });

const { createService } = require("./createService");
const { startService } = require("./startService");
const { logger, requestLogger } = require("./logger");
const { AppError, notFound, errorHandler } = require("./errors");
const { connectDb } = require("./db");
const { validate } = require("./validate");
const { istDateString, toIstIso, formatIst } = require("./timezone");
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
  istDateString,
  toIstIso,
  formatIst,
  COOKIE_NAME,
  assertAuthConfig,
  signToken,
  verifyToken,
  cookieOptions,
  requireAuth,
  requireRole,
};
