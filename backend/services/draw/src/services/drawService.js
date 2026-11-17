const mongoose = require("mongoose");
const Draw = require("../models/Draw");
const DrawResult = require("../models/DrawResult");
const engine = require("./drawEngine");
const subscriptions = require("./subscriptionClient");
const scores = require("./scoreClient");
const { AppError } = require("@dh/shared");
const { MIN_SCORES_TO_ENTER } = require("../constants");

// Pool contribution per active subscriber, in paise. The PRD does not give the amount,
// so it is set in the environment and must be confirmed with the client. Default: ₹100.
function contributionPerSubscriberPaise() {
  return Number(process.env.CONTRIBUTION_PER_SUBSCRIBER_PAISE || 10000);
}

async function findDraw(id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid draw id", 400);
  const draw = await Draw.findOne({ _id: id });
  if (!draw) throw new AppError("Draw not found", 404);
  return draw;
}

// Who is entered this month: active subscribers who hold at least 5 scores.
// The pool is sized on ALL active subscribers, as the PRD requires (PRD 06).
async function buildSnapshot() {
  const userIds = await subscriptions.fetchActiveSubscriberIds();
  const latest = userIds.length ? await scores.fetchLatestScores(userIds) : {};
  const entries = userIds
    .filter((id) => (latest[id] || []).length >= MIN_SCORES_TO_ENTER)
    .map((id) => ({ userId: id, scores: latest[id].slice(0, MIN_SCORES_TO_ENTER) }));
  return { subscriberCount: userIds.length, entries };
}

async function createDraft(month, mode) {
  try {
    return await Draw.create({ month, mode, status: "draft" });
  } catch (err) {
    if (err.code === 11000) throw new AppError("A draw for this month already exists", 409);
    throw err;
  }
}

// Runs the draw and stores the full outcome. Nothing is visible to subscribers until publish.
// Running it again replaces the previous simulation, so the admin always sees the latest numbers.
async function simulateDraw(drawId, requestedMode) {
  const draw = await findDraw(drawId);
  if (draw.status === "published") throw new AppError("This draw is already published and cannot change", 409);

  const mode = requestedMode ?? draw.mode;
  const snapshot = await buildSnapshot();
  const numbers = engine.generateNumbers(mode, engine.frequencyWeights(snapshot.entries.map((e) => e.scores)));

  // The jackpot rolls over from the most recent published draw before this one
  const previous = await Draw.findOne({ status: "published", month: { $lt: draw.month } }).sort({ month: -1 });
  const jackpotCarryInPaise = previous?.pool?.rolloverOutPaise ?? 0;

  const outcome = engine.computeOutcome({
    numbers,
    entries: snapshot.entries,
    subscriberCount: snapshot.subscriberCount,
    contributionPerSubscriberPaise: contributionPerSubscriberPaise(),
    jackpotCarryInPaise,
  });

  await DrawResult.deleteMany({ drawId: draw._id });
  if (outcome.results.length) {
    await DrawResult.insertMany(
      outcome.results.map((r) => ({
        drawId: draw._id,
        userId: r.userId,
        scores: r.scores,
        matches: r.matches,
        tier: r.tier,
        prizePaise: r.prizePaise,
        payoutStatus: r.tier ? "pending" : null,
      }))
    );
  }

  return Draw.findOneAndUpdate(
    { _id: draw._id },
    {
      $set: {
        mode,
        status: "simulated",
        numbers,
        pool: outcome.pool,
        winnerCounts: outcome.winnerCounts,
        simulatedAt: new Date(),
      },
    },
    { new: true }
  );
}

// Publishes the simulated draw. Only a simulated draw can be published, and the status check
// happens in the same database write, so two admins cannot publish twice.
async function publishDraw(drawId) {
  const draw = await findDraw(drawId);
  if (draw.status === "published") throw new AppError("This draw is already published", 409);
  if (draw.status !== "simulated") throw new AppError("Simulate the draw before publishing it", 409);

  const published = await Draw.findOneAndUpdate(
    { _id: draw._id, status: "simulated" },
    { $set: { status: "published", publishedAt: new Date() } },
    { new: true }
  );
  if (!published) throw new AppError("The draw changed while publishing. Simulate it again.", 409);
  return published;
}

module.exports = {
  buildSnapshot,
  createDraft,
  simulateDraw,
  publishDraw,
  findDraw,
  contributionPerSubscriberPaise,
};
