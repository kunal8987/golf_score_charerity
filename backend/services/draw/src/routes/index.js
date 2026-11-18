const express = require("express");
const { requireAuth, requireRole, validate, requireInternalKey } = require("@dh/shared");
const ctrl = require("../controllers/drawController");
const schemas = require("../validators/draw.validator");
const internal = require("../controllers/internalController");

const router = express.Router();

// Subscriber views (PRD 10: participation, winnings, upcoming draw)
router.get("/draws/latest", requireAuth, ctrl.latest);
router.get("/draws/me", requireAuth, ctrl.mine);

// Admin (PRD 06 and 11: configure, simulate, publish, reports)
router.get("/admin/draws", requireAuth, requireRole("admin"), ctrl.adminList);
router.post("/admin/draws", requireAuth, requireRole("admin"), validate(schemas.createDraw), ctrl.adminCreate);
router.get("/admin/draws/:id", requireAuth, requireRole("admin"), ctrl.adminDetail);
router.post("/admin/draws/:id/simulate", requireAuth, requireRole("admin"), validate(schemas.simulateDraw), ctrl.adminSimulate);
router.post("/admin/draws/:id/publish", requireAuth, requireRole("admin"), ctrl.adminPublish);
router.get("/admin/reports/draws", requireAuth, requireRole("admin"), ctrl.adminReport);

// Service-to-service: the winner service reads winners and mirrors payouts
router.get("/internal/winners", requireInternalKey, internal.winners);
router.patch("/internal/results/:drawResultId/payout", requireInternalKey, validate(schemas.payoutUpdate), internal.setPayout);

module.exports = router;
