const express = require("express");
const { requireAuth, requireRole, validate } = require("@dh/shared");
const ctrl = require("../controllers/winnerController");
const { singleProof } = require("../middleware/proofUpload");
const schemas = require("../validators/winner.validator");

const router = express.Router();

// Subscriber: winnings overview and proof upload (PRD 09, 10)
router.get("/winners/me", requireAuth, ctrl.mine);
router.post("/winners/:id/proof", requireAuth, singleProof, ctrl.uploadProof);

// Admin: winners list, verification, payouts (PRD 09, 11)
router.get("/admin/winners", requireAuth, requireRole("admin"), ctrl.adminList);
router.get("/admin/winners/:id", requireAuth, requireRole("admin"), ctrl.adminDetail);
router.patch("/admin/winners/:id/review", requireAuth, requireRole("admin"), validate(schemas.review), ctrl.review);
router.patch("/admin/winners/:id/payout", requireAuth, requireRole("admin"), ctrl.pay);

module.exports = router;
