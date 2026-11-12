// Charity contribution from a subscription fee (PRD 08.1: minimum 10%, users may increase it).
// Works in whole paise so there are no floating-point errors. Rounds down, so the charity
// never gets more than the agreed share.
const MIN_PERCENTAGE = 10;
const MAX_PERCENTAGE = 100;

function contributionAmount(feePaise, percentage) {
  if (!Number.isInteger(feePaise) || feePaise < 0) {
    throw new RangeError("Fee must be a non-negative whole number of paise");
  }
  if (!Number.isInteger(percentage) || percentage < MIN_PERCENTAGE || percentage > MAX_PERCENTAGE) {
    throw new RangeError(`Percentage must be a whole number from ${MIN_PERCENTAGE} to ${MAX_PERCENTAGE}`);
  }
  return Math.floor((feePaise * percentage) / 100);
}

module.exports = { contributionAmount, MIN_PERCENTAGE, MAX_PERCENTAGE };
