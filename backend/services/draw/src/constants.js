// Draw rules (PRD 06 and 07)
const DRAW_SIZE = 5; // 5 numbers are drawn each month
const NUMBER_MIN = 1; // same range as Stableford scores (PRD 05)
const NUMBER_MAX = 45;
const MIN_SCORES_TO_ENTER = 5; // a subscriber must hold 5 scores to be entered (see README)

// Share of the prize pool for each match tier, in percent (PRD 07). Must total 100.
const POOL_SPLIT = { five: 40, four: 35, three: 25 };

const MODES = ["random", "algorithmic"];

module.exports = { DRAW_SIZE, NUMBER_MIN, NUMBER_MAX, MIN_SCORES_TO_ENTER, POOL_SPLIT, MODES };
