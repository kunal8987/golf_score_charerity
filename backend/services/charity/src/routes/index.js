const express = require("express");
const { requireAuth, requireRole, validate } = require("@dh/shared");
const charity = require("../controllers/charityController");
const donation = require("../controllers/donationController");
const schemas = require("../validators/charity.validator");

const router = express.Router();

// Public charity pages (PRD 08.2: directory, profiles, homepage spotlight)
router.get("/", charity.directory);
router.get("/spotlight", charity.spotlight);

// Logged-in users: one-time donations (PRD 08.2: independent donation, not tied to gameplay)
router.post("/donations", requireAuth, validate(schemas.createDonation), donation.create);
router.get("/donations/me", requireAuth, donation.mine);

// Admin: manage charities, events, and totals (PRD 11, control surface 03 and 05)
router.get("/admin/charities", requireAuth, requireRole("admin"), charity.adminList);
router.post("/admin/charities", requireAuth, requireRole("admin"), validate(schemas.createCharity), charity.adminCreate);
router.patch("/admin/charities/:id", requireAuth, requireRole("admin"), validate(schemas.updateCharity), charity.adminUpdate);
router.delete("/admin/charities/:id", requireAuth, requireRole("admin"), charity.adminDelete);
router.post("/admin/charities/:id/events", requireAuth, requireRole("admin"), validate(schemas.createEvent), charity.adminAddEvent);
router.delete("/admin/charities/:id/events/:eventId", requireAuth, requireRole("admin"), charity.adminDeleteEvent);
router.get("/admin/reports/donations", requireAuth, requireRole("admin"), donation.adminReport);

// Public charity detail last, so "/spotlight" and "/donations/me" are not read as ids
router.get("/:id", charity.detail);

module.exports = router;
