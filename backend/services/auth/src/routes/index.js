const express = require("express");
const rateLimit = require("express-rate-limit");
const { requireAuth, requireRole, validate } = require("@dh/shared");
const ctrl = require("../controllers/authController");
const schemas = require("../validators/auth.validator");

const router = express.Router();

// Brute-force protection on the two endpoints that check passwords.
// The gateway forwards the client IP (see trust proxy in index.js).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { success: false, error: { message: "Too many attempts. Try again in 15 minutes." } },
});

router.post("/signup", authLimiter, validate(schemas.signup), ctrl.signup);
router.post("/login", authLimiter, validate(schemas.login), ctrl.login);
router.post("/logout", ctrl.logout);

router.get("/me", requireAuth, ctrl.me);
router.patch("/me", requireAuth, validate(schemas.updateProfile), ctrl.updateMe);

router.get("/users", requireAuth, requireRole("admin"), ctrl.listUsers);
router.patch("/users/:id", requireAuth, requireRole("admin"), validate(schemas.adminUpdate), ctrl.updateUser);

module.exports = router;
