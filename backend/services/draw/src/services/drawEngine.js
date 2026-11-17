// Pure draw logic. No database or network calls, so every rule can be tested directly.
const crypto = require("crypto");
const { DRAW_SIZE, NUMBER_MIN, NUMBER_MAX, POOL_SPLIT } = require("../constants");

const allNumbers = () => Array.from({ length: NUMBER_MAX - NUMBER_MIN + 1 }, (_, i) => i + NUMBER_MIN);

// Standard lottery-style draw: every number is equally likely.
// crypto.randomInt is used (not Math.random) so results cannot be predicted.
function uniformDraw() {
  const pool = allNumbers();
  const picked = [];
  while (picked.length < DRAW_SIZE) {
    const [n] = pool.splice(crypto.randomInt(pool.length), 1);
    picked.push(n);
  }
  return picked.sort((a, b) => a - b);
}

// Weighted draw without repeats. weights[n] is the chance weight of number n.
function weightedDraw(weights) {
  const pool = allNumbers().map((n) => ({ n, w: weights[n] ?? 1 }));
  const picked = [];
  while (picked.length < DRAW_SIZE) {
    const total = pool.reduce((sum, x) => sum + x.w, 0);
    let r = crypto.randomInt(total);
    let idx = 0;
    while (r >= pool[idx].w) {
      r -= pool[idx].w;
      idx += 1;
    }
    picked.push(pool[idx].n);
    pool.splice(idx, 1);
  }
  return picked.sort((a, b) => a - b);
}

// Algorithmic weights: a score that appears more often across entrants is more likely to be drawn.
// Every number starts at 1, so no number is ever impossible.
function frequencyWeights(scoreLists) {
  const weights = {};
  for (const n of allNumbers()) weights[n] = 1;
  for (const scores of scoreLists) {
    for (const s of scores) {
      if (weights[s] !== undefined) weights[s] += 1;
    }
  }
  return weights;
}

function generateNumbers(mode, weights) {
  if (mode === "random") return uniformDraw();
  if (mode === "algorithmic") return weightedDraw(weights ?? frequencyWeights([]));
  throw new RangeError(`Unknown draw mode: ${mode}`);
}

// How many different drawn numbers appear in the user's scores (a repeated score counts once).
function matchCount(scores, numbers) {
  const drawn = new Set(numbers);
  return new Set(scores.filter((s) => drawn.has(s))).size;
}

function tierFor(matches) {
  if (matches === 5) return "five";
  if (matches === 4) return "four";
  if (matches === 3) return "three";
  return null;
}

// Whole-number percentage of an amount in paise. Rounds down, never invents money.
const share = (totalPaise, percent) => Math.floor((totalPaise * percent) / 100);

// Builds the full outcome of one draw.
//
// Money rules (PRD 07):
// - The pool is subscribers x contribution per subscriber, split 40/35/25 by tier.
// - Prizes in a tier are split equally between that tier's winners (rounded down).
// - The 5-match jackpot rolls over to next month if nobody wins it. It also takes any
//   carry-in from the previous draw.
// - Unclaimed 4-match and 3-match money is not rolled over (PRD: "No"). It is recorded as forfeited.
// - Paise lost to rounding are recorded as forfeited, so nothing disappears unaccounted.
//
// Invariant: paidPaise + rolloverOutPaise + forfeitPaise === totalPaise + jackpotCarryInPaise
function computeOutcome({
  numbers,
  entries,
  subscriberCount,
  contributionPerSubscriberPaise,
  jackpotCarryInPaise = 0,
}) {
  const totalPaise = subscriberCount * contributionPerSubscriberPaise;
  const fivePaise = share(totalPaise, POOL_SPLIT.five);
  const fourPaise = share(totalPaise, POOL_SPLIT.four);
  const threePaise = share(totalPaise, POOL_SPLIT.three);
  const roundingPaise = totalPaise - fivePaise - fourPaise - threePaise;
  const fiveAvailablePaise = fivePaise + jackpotCarryInPaise;

  const results = entries.map((entry) => {
    const matches = matchCount(entry.scores, numbers);
    return { userId: entry.userId, scores: entry.scores, matches, tier: tierFor(matches), prizePaise: 0 };
  });

  const winnerCounts = { five: 0, four: 0, three: 0 };
  for (const r of results) if (r.tier) winnerCounts[r.tier] += 1;

  const tierPool = { five: fiveAvailablePaise, four: fourPaise, three: threePaise };
  const perWinner = {};
  for (const tier of ["five", "four", "three"]) {
    perWinner[tier] = winnerCounts[tier] ? Math.floor(tierPool[tier] / winnerCounts[tier]) : 0;
  }
  for (const r of results) if (r.tier) r.prizePaise = perWinner[r.tier];

  const paidPaise = results.reduce((sum, r) => sum + r.prizePaise, 0);
  const fiveRolloverPaise =
    winnerCounts.five === 0 ? fiveAvailablePaise : fiveAvailablePaise - perWinner.five * winnerCounts.five;
  const forfeitPaise =
    fourPaise - perWinner.four * winnerCounts.four +
    threePaise - perWinner.three * winnerCounts.three +
    roundingPaise;

  return {
    numbers,
    results,
    winnerCounts,
    pool: {
      subscriberCount,
      contributionPerSubscriberPaise,
      totalPaise,
      jackpotCarryInPaise,
      fiveTierPaise: fivePaise,
      fiveAvailablePaise,
      fourTierPaise: fourPaise,
      threeTierPaise: threePaise,
      paidPaise,
      rolloverOutPaise: fiveRolloverPaise,
      forfeitPaise,
    },
  };
}

module.exports = {
  generateNumbers,
  frequencyWeights,
  matchCount,
  tierFor,
  computeOutcome,
  share,
};
