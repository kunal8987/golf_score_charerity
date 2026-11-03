const express = require("express");
const { requireAuth, requireRole, validate } = require("@dh/shared");
const ctrl = require("../controllers/scoreController");
const schemas = require("../validators/score.validator");
const { requireActiveSubscription } = require("../middleware/subscriptionGuard");

const router = express.Router();

// Subscriber routes: login, validate input (cheap, no network), then an active subscription
router.get("/scores", requireAuth, requireActiveSubscription, ctrl.list);
router.post("/scores", requireAuth, validate(schemas.createScore), requireActiveSubscription, ctrl.create);
router.put("/scores/:id", requireAuth, validate(schemas.updateScore), requireActiveSubscription, ctrl.update);
router.delete("/scores/:id", requireAuth, requireActiveSubscription, ctrl.remove);

// Admin routes
router.get("/admin/scores", requireAuth, requireRole("admin"), ctrl.adminList);
router.patch("/admin/scores/:id", requireAuth, requireRole("admin"), validate(schemas.updateScore), ctrl.adminUpdate);

module.exports = router;
