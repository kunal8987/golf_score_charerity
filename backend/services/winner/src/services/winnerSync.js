const Winner = require("../models/Winner");
const drawClient = require("./drawClient");
const { VERIFICATION, PAYOUT } = require("../constants");

// Copies new winners from the draw service into this service. It runs at most once per
// WINNER_SYNC_TTL_MS (default 60 seconds), so reads stay fast.
let lastSyncAt = 0;

async function syncWinners({ force = false } = {}) {
  const ttl = Number(process.env.WINNER_SYNC_TTL_MS ?? 60000);
  if (!force && Date.now() - lastSyncAt < ttl) return 0;

  const winners = await drawClient.fetchWinners();
  let added = 0;
  for (const w of winners) {
    if (await Winner.findOne({ drawResultId: w.drawResultId })) continue;
    try {
      await Winner.create({
        drawResultId: w.drawResultId,
        drawId: w.drawId,
        userId: w.userId,
        month: w.month,
        tier: w.tier,
        matches: w.matches,
        prizePaise: w.prizePaise,
        verificationStatus: VERIFICATION.AWAITING_PROOF,
        payoutStatus: PAYOUT.PENDING,
      });
      added += 1;
    } catch (err) {
      if (err.code !== 11000) throw err; // a duplicate from a parallel sync is fine
    }
  }
  lastSyncAt = Date.now();
  return added;
}

module.exports = { syncWinners };
