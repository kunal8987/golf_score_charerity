const jwt = require("jsonwebtoken");
const { AppError } = require("./errors");

const COOKIE_NAME = "dh_token";
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set in .env and be at least 32 characters long");
  }
  return secret;
}

// Call at service startup so a missing secret fails fast, not on the first login.
function assertAuthConfig() {
  getSecret();
}

function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, getSecret(), {
    algorithm: "HS256",
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret(), { algorithms: ["HS256"] });
}

function cookieOptions() {
  return {
    httpOnly: true, // JavaScript on the page cannot read the token
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS * 1000,
  };
}

// Accepts "Authorization: Bearer <token>" or the httpOnly cookie.
function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) return header.slice(7);
  return req.cookies ? req.cookies[COOKIE_NAME] : undefined;
}

// Sets req.user = { id, role } or responds 401.
function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next(new AppError("Authentication required", 401));
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch {
    return next(new AppError("Invalid or expired session", 401));
  }
}

// Use after requireAuth: requireRole("admin")
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError("You do not have permission to do this", 403));
    }
    return next();
  };
}

module.exports = {
  COOKIE_NAME,
  assertAuthConfig,
  signToken,
  verifyToken,
  cookieOptions,
  requireAuth,
  requireRole,
};
