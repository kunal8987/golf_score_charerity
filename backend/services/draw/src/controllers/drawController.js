const Draw = require("../models/Draw");
const DrawResult = require("../models/DrawResult");
const drawService = require("../services/drawService");
const { AppError } = require("@dh/shared");

const inr = (paise) => paise / 100;

// Subscriber view of a pool: what they need to show the jackpot and the split
function publicPool(pool) {
  return {
    totalInr: inr(pool.totalPaise),
    jackpotCarryInInr: inr(pool.jackpotCarryInPaise),
    fiveMatchInr: inr(pool.fiveAvailablePaise),
    fourMatchInr: inr(pool.fourTierPaise),
    threeMatchInr: inr(pool.threeTierPaise),
  };
}

function drawSummary(draw) {
  return {
    id: String(draw._id),
    month: draw.month,
    mode: draw.mode,
    status: draw.status,
    numbers: draw.numbers,
    winnerCounts: draw.winnerCounts,
    publishedAt: draw.publishedAt,
  };
}

// ---------- subscriber ----------

exports.latest = async (req, res) => {
  const draw = await Draw.findOne({ status: "published" }).sort({ month: -1 });
  if (!draw) return res.json({ success: true, data: { draw: null } });
  res.json({
    success: true,
    data: { draw: { month: draw.month, numbers: draw.numbers, publishedAt: draw.publishedAt, pool: publicPool(draw.pool), winnerCounts: draw.winnerCounts } },
  });
};

// The user's own participation and winnings, plus the next draw (PRD 10)
exports.mine = async (req, res) => {
  const results = await DrawResult.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(24);
  const drawIds = results.map((r) => r.drawId);
  const draws = drawIds.length ? await Draw.find({ _id: { $in: drawIds } }) : [];
  const byId = new Map(draws.map((d) => [String(d._id), d]));

  const history = results
    .filter((r) => byId.get(String(r.drawId))?.status === "published")
    .map((r) => {
      const d = byId.get(String(r.drawId));
      return {
        month: d.month,
        numbers: d.numbers,
        scores: r.scores,
        matches: r.matches,
        tier: r.tier,
        prizeInr: inr(r.prizePaise),
        payoutStatus: r.payoutStatus,
      };
    });

  const upcoming = (await Draw.find({ status: { $ne: "published" } })).sort((a, b) => (a.month < b.month ? -1 : 1))[0];
  res.json({
    success: true,
    data: {
      entries: history.length,
      history,
      upcoming: upcoming ? { month: upcoming.month } : null,
    },
  });
};

// ---------- admin ----------

exports.adminList = async (req, res) => {
  const draws = await Draw.find({}).sort({ month: -1 }).limit(60);
  res.json({ success: true, data: { draws: draws.map(drawSummary) } });
};

exports.adminCreate = async (req, res) => {
  const draw = await drawService.createDraft(req.body.month, req.body.mode);
  res.status(201).json({ success: true, data: { draw: drawSummary(draw) } });
};

exports.adminDetail = async (req, res) => {
  const draw = await drawService.findDraw(req.params.id);
  const winners = await DrawResult.find({ drawId: draw._id, tier: { $ne: null } }).sort({ matches: -1 });
  res.json({
    success: true,
    data: {
      draw: { ...drawSummary(draw), pool: draw.pool, simulatedAt: draw.simulatedAt },
      winners: winners.map((w) => ({
        userId: String(w.userId),
        matches: w.matches,
        tier: w.tier,
        prizeInr: inr(w.prizePaise),
        payoutStatus: w.payoutStatus,
      })),
      entrantCount: await DrawResult.countDocuments({ drawId: draw._id }),
    },
  });
};

exports.adminSimulate = async (req, res) => {
  const draw = await drawService.simulateDraw(req.params.id, req.body.mode);
  res.json({ success: true, data: { draw: drawSummary(draw), pool: draw.pool } });
};

exports.adminPublish = async (req, res) => {
  const draw = await drawService.publishDraw(req.params.id);
  res.json({ success: true, data: { draw: drawSummary(draw) } });
};

// Reports (PRD 11, control surface 05): totals across published draws
exports.adminReport = async (req, res) => {
  const published = await Draw.find({ status: "published" });
  const sum = (fn) => published.reduce((total, d) => total + fn(d), 0);
  const latest = [...published].sort((a, b) => (a.month < b.month ? 1 : -1))[0];

  res.json({
    success: true,
    data: {
      publishedDraws: published.length,
      totalPoolInr: inr(sum((d) => d.pool.totalPaise)),
      paidOutInr: inr(sum((d) => d.pool.paidPaise)),
      forfeitedInr: inr(sum((d) => d.pool.forfeitPaise)),
      jackpotRolloverInr: latest ? inr(latest.pool.rolloverOutPaise) : 0,
      winnersByTier: {
        five: sum((d) => d.winnerCounts.five),
        four: sum((d) => d.winnerCounts.four),
        three: sum((d) => d.winnerCounts.three),
      },
    },
  });
};
