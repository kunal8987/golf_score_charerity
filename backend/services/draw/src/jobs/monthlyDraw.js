const cron = require("node-cron");
const { istDateString, logger } = require("@dh/shared");
const { createDraft } = require("../services/drawService");

// Creates the draft draw for a month. Safe to run twice: the second run does nothing.
async function ensureDraftForMonth(month = istDateString().slice(0, 7)) {
  try {
    return await createDraft(month, process.env.DRAW_DEFAULT_MODE || "random");
  } catch (err) {
    if (err.status === 409) return null; // already exists
    throw err;
  }
}

// 00:05 on the 1st of every month, India time. Creates the draft. An admin still simulates and publishes.
function startMonthlyJob() {
  return cron.schedule(
    "5 0 1 * *",
    () => {
      ensureDraftForMonth().catch((err) => logger.error({ err }, "Monthly draw draft failed"));
    },
    { timezone: "Asia/Kolkata" }
  );
}

module.exports = { ensureDraftForMonth, startMonthlyJob };
