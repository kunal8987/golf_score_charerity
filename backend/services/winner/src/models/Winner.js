const mongoose = require("mongoose");
const { VERIFICATION, PAYOUT } = require("../constants");

// Stored proof details. The file itself lives in private (authenticated) cloud storage.
const proofSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    uploadedAt: { type: Date, required: true },
  },
  { _id: false }
);

// One row per winning entry in a published draw. Created from the draw service, then
// verification and payout are tracked here. This service is the source of truth for them.
const winnerSchema = new mongoose.Schema(
  {
    drawResultId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    drawId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    month: { type: String, required: true },
    tier: { type: String, enum: ["five", "four", "three"], required: true },
    matches: { type: Number, min: 3, max: 5, required: true },
    prizePaise: { type: Number, min: 0, required: true },
    verificationStatus: {
      type: String,
      enum: Object.values(VERIFICATION),
      default: VERIFICATION.AWAITING_PROOF,
      index: true,
    },
    proof: { type: proofSchema, default: null },
    rejectionReason: { type: String, default: "" },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: String, default: null },
    payoutStatus: { type: String, enum: Object.values(PAYOUT), default: PAYOUT.PENDING, index: true },
    paidAt: { type: Date, default: null },
    paidBy: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Winner || mongoose.model("Winner", winnerSchema);
