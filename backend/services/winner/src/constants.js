// Winner verification and payout rules (PRD 09)
const PROOF_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const PROOF_TYPES = ["image/jpeg", "image/png"];

const VERIFICATION = {
  AWAITING_PROOF: "awaiting_proof", // winner has not uploaded a screenshot yet
  PENDING_REVIEW: "pending_review", // screenshot uploaded, waiting for an admin
  APPROVED: "approved",
  REJECTED: "rejected", // winner may upload a new screenshot
};

const PAYOUT = { PENDING: "pending", PAID: "paid" };

module.exports = { PROOF_MAX_BYTES, PROOF_TYPES, VERIFICATION, PAYOUT };
