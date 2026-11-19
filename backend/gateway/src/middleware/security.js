const crypto = require("crypto");
const { AppError } = require("@dh/shared");
const { bodyLimitFor } = require("../config");

// Headers the gateway sets itself. A client must never be able to send these, or it could claim
// to be an admin or call an internal endpoint.
const RESERVED_HEADERS = ["x-user-id", "x-user-role", "x-internal-key"];

// Runs first on every /api request: remove reserved headers and give the request an ID.
function cleanClientHeaders(req, res, next) {
  for (const name of RESERVED_HEADERS) delete req.headers[name];

  const incoming = req.get("x-request-id");
  const requestId = incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  req.headers["x-request-id"] = requestId; // forwarded to the service, so logs can be joined up
  res.setHeader("X-Request-Id", requestId);
  next();
}

// Service-to-service paths are never reachable from outside
function blockInternal(req, res, next) {
  if (req.path.includes("/internal/")) {
    return next(new AppError("Route not found", 404));
  }
  return next();
}

// Refuses large bodies before they are forwarded. Based on the Content-Length header; requests
// without one (chunked) are not measured here, and the service's own parser still limits them.
function enforceBodyLimit(serviceName) {
  return (req, res, next) => {
    const declared = Number(req.get("content-length") || 0);
    if (declared > bodyLimitFor(serviceName, req.method, req.path)) {
      return next(new AppError("Request body is too large", 413));
    }
    return next();
  };
}

module.exports = { cleanClientHeaders, blockInternal, enforceBodyLimit, RESERVED_HEADERS };
