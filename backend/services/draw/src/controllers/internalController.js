const Draw = require("../models/Draw");
const DrawResult = require("../models/DrawResult");
const { AppError } = require("@dh/shared");

// Called by the winner service. Every winning entry in a published draw.
exports.winners = async (req, res) => {
  const draws = await Draw.find({ status: "published" });
  if (!draws.length) return res.json({ success: true, data: { winners: [] } });

  const months = new Map(draws.map((d) => [String(d._id), d.month]));
  const rows = await DrawResult.find({ drawId: { $in: [...months.keys()] }, tier: { $ne: null } }).sort({ createdAt: 1 });

  res.json({
    success: true,
    data: {
      winners: rows.map((r) => ({
        drawResultId: String(r._id),
        drawId: String(r.drawId),
        month: months.get(String(r.drawId)),
        userId: String(r.userId),
        tier: r.tier,
        matches: r.matches,
        prizePaise: r.prizePaise,
      })),
    },
  });
};

// Called by the winner service when a payout changes. The winner service is the source of truth;
// this copy keeps the subscriber's draw history in step.
exports.setPayout = async (req, res) => {
  const row = await DrawResult.findOneAndUpdate(
    { _id: req.params.drawResultId, tier: { $ne: null } },
    { $set: { payoutStatus: req.body.payoutStatus } },
    { new: true }
  );
  if (!row) throw new AppError("Winning entry not found", 404);
  res.json({ success: true, data: { drawResultId: String(row._id), payoutStatus: row.payoutStatus } });
};
