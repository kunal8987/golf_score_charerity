const mongoose = require("mongoose");
const Winner = require("../models/Winner");
const { AppError, logger, formatIst } = require("@dh/shared");
const { VERIFICATION, PAYOUT } = require("../constants");
const { detectImageType } = require("../services/fileCheck");
const proofStorage = require("../services/proofStorage");
const drawClient = require("../services/drawClient");
const { syncWinners } = require("../services/winnerSync");

const inr = (paise) => paise / 100;

function assertId(id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid winner id", 400);
}

function publicWinner(w) {
  return {
    id: String(w._id),
    userId: String(w.userId),
    month: w.month,
    tier: w.tier,
    matches: w.matches,
    prizeInr: inr(w.prizePaise),
    verificationStatus: w.verificationStatus,
    rejectionReason: w.rejectionReason || "",
    proofUploaded: Boolean(w.proof),
    payoutStatus: w.payoutStatus,
    paidAt: w.paidAt,
  };
}

// A failed sync should not stop the page loading. Stored data is still shown.
async function trySync() {
  try {
    await syncWinners();
    return true;
  } catch (err) {
    logger.warn({ err }, "Winner sync failed. Showing stored data.");
    return false;
  }
}

// ---------- subscriber ----------

// The user's winnings, verification and payout status (PRD 10: winnings overview)
exports.mine = async (req, res) => {
  const synced = await trySync();
  const winnings = await Winner.find({ userId: req.user.id }).sort({ month: -1 });

  const wonPaise = winnings.reduce((sum, w) => sum + w.prizePaise, 0);
  const paidPaise = winnings.filter((w) => w.payoutStatus === PAYOUT.PAID).reduce((sum, w) => sum + w.prizePaise, 0);
  res.json({
    success: true,
    data: {
      winnings: winnings.map(publicWinner),
      totals: { wonInr: inr(wonPaise), paidInr: inr(paidPaise), pendingInr: inr(wonPaise - paidPaise) },
      synced,
    },
  });
};

// Upload a screenshot of the golf platform scores (PRD 09)
exports.uploadProof = async (req, res) => {
  assertId(req.params.id);
  const winner = await Winner.findOne({ _id: req.params.id, userId: req.user.id });
  if (!winner) throw new AppError("Winning entry not found", 404);

  if (winner.verificationStatus === VERIFICATION.PENDING_REVIEW) {
    throw new AppError("Your screenshot is already waiting for review", 409);
  }
  if (winner.verificationStatus === VERIFICATION.APPROVED) {
    throw new AppError("This prize has already been verified", 409);
  }
  if (!req.file) throw new AppError("Send one screenshot in the 'proof' field", 400);

  // Decided by the file's content, not by its name or the sender's claim
  const mimeType = detectImageType(req.file.buffer);
  if (!mimeType) throw new AppError("The proof must be a JPEG or PNG image", 400);

  const stored = await proofStorage.uploadProof(req.file.buffer, winner._id, mimeType);

  // The status check is repeated in the write, so two uploads cannot race
  const updated = await Winner.findOneAndUpdate(
    { _id: winner._id, verificationStatus: { $in: [VERIFICATION.AWAITING_PROOF, VERIFICATION.REJECTED] } },
    {
      $set: {
        verificationStatus: VERIFICATION.PENDING_REVIEW,
        proof: { publicId: stored.publicId, mimeType, sizeBytes: req.file.size, uploadedAt: new Date() },
        rejectionReason: "",
        reviewedAt: null,
        reviewedBy: null,
      },
    },
    { new: true }
  );
  if (!updated) throw new AppError("Your prize changed while uploading. Refresh and try again.", 409);

  res.json({ success: true, data: { winning: publicWinner(updated) } });
};

// ---------- admin ----------

exports.adminList = async (req, res) => {
  const synced = await trySync();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

  const filter = {};
  if (Object.values(VERIFICATION).includes(req.query.verificationStatus)) {
    filter.verificationStatus = req.query.verificationStatus;
  }
  if (Object.values(PAYOUT).includes(req.query.payoutStatus)) {
    filter.payoutStatus = req.query.payoutStatus;
  }

  const [winners, total] = await Promise.all([
    Winner.find(filter).sort({ month: -1 }).skip((page - 1) * limit).limit(limit),
    Winner.countDocuments(filter),
  ]);
  res.json({ success: true, data: { winners: winners.map(publicWinner), page, limit, total, synced } });
};

// Shows the proof through a short-lived signed link
exports.adminDetail = async (req, res) => {
  assertId(req.params.id);
  const winner = await Winner.findOne({ _id: req.params.id });
  if (!winner) throw new AppError("Winning entry not found", 404);

  res.json({
    success: true,
    data: {
      winning: {
        ...publicWinner(winner),
        proofUrl: winner.proof ? proofStorage.signedProofUrl(winner.proof.publicId) : null,
        proofExpiresNote: winner.proof ? "Link valid for 5 minutes" : null,
        reviewedAt: winner.reviewedAt,
        reviewedBy: winner.reviewedBy,
        paidBy: winner.paidBy,
        draw: { month: winner.month },
        paidAtIst: winner.paidAt ? formatIst(winner.paidAt) : null,
      },
    },
  });
};

exports.review = async (req, res) => {
  assertId(req.params.id);
  const winner = await Winner.findOne({ _id: req.params.id });
  if (!winner) throw new AppError("Winning entry not found", 404);
  if (winner.verificationStatus !== VERIFICATION.PENDING_REVIEW) {
    throw new AppError("Only a submitted screenshot can be reviewed", 409);
  }

  const { decision, reason } = req.body;
  const change =
    decision === "approve"
      ? { verificationStatus: VERIFICATION.APPROVED, rejectionReason: "" }
      : { verificationStatus: VERIFICATION.REJECTED, rejectionReason: reason };

  const updated = await Winner.findOneAndUpdate(
    { _id: winner._id, verificationStatus: VERIFICATION.PENDING_REVIEW },
    { $set: { ...change, reviewedAt: new Date(), reviewedBy: req.user.id } },
    { new: true }
  );
  if (!updated) throw new AppError("This screenshot was already reviewed", 409);

  res.json({ success: true, data: { winning: publicWinner(updated) } });
};

// Marks the prize as paid. Only after approval. Claimed first so it can only happen once, then
// mirrored to the draw service. If the mirror fails, the claim is undone.
exports.pay = async (req, res) => {
  assertId(req.params.id);
  const claimed = await Winner.findOneAndUpdate(
    { _id: req.params.id, verificationStatus: VERIFICATION.APPROVED, payoutStatus: PAYOUT.PENDING },
    { $set: { payoutStatus: PAYOUT.PAID, paidAt: new Date(), paidBy: req.user.id } },
    { new: true }
  );

  if (!claimed) {
    const current = await Winner.findOne({ _id: req.params.id });
    if (!current) throw new AppError("Winning entry not found", 404);
    if (current.verificationStatus !== VERIFICATION.APPROVED) {
      throw new AppError("Verify the screenshot before paying this prize", 409);
    }
    throw new AppError("This prize has already been paid", 409);
  }

  try {
    await drawClient.setPayout(String(claimed.drawResultId), PAYOUT.PAID);
  } catch (err) {
    await Winner.findOneAndUpdate(
      { _id: claimed._id },
      { $set: { payoutStatus: PAYOUT.PENDING, paidAt: null, paidBy: null } }
    );
    logger.error({ err }, "Payout mirror failed. Payout claim reverted.");
    throw new AppError("Could not update the draw record. Nothing was changed, so try again.", 503, true);
  }

  res.json({ success: true, data: { winning: publicWinner(claimed) } });
};
