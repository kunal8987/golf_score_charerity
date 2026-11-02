const express = require("express");
const { requireAuth, requireRole, validate } = require("@dh/shared");
const ctrl = require("../controllers/subscriptionController");
const schemas = require("../validators/subscription.validator");
const { requireInternalKey } = require("../middleware/internalAuth");

const router = express.Router();

router.post("/checkout", requireAuth, validate(schemas.checkout), ctrl.checkout);
router.get("/status", requireAuth, ctrl.status);
router.post("/cancel", requireAuth, ctrl.cancel);
router.post("/resume", requireAuth, ctrl.resume);

router.get("/internal/access/:userId", requireInternalKey, ctrl.internalAccess);

router.get("/admin/subscriptions", requireAuth, requireRole("admin"), ctrl.adminList);

module.exports = router;
