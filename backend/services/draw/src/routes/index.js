const express = require("express");
const { requireAuth, requireRole, validate } = require("@dh/shared");
const ctrl = require("../controllers/drawController");
const schemas = require("../validators/draw.validator");

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

module.exports = router;
