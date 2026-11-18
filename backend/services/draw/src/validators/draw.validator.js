const { z } = require("zod");
const { MODES } = require("../constants");

const month = z
  .string({ required_error: "Month is required" })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be in YYYY-MM format, for example 2026-12");

const mode = z.enum(MODES, { errorMap: () => ({ message: "Mode must be random or algorithmic" }) });

const createDraw = z.object({ month, mode: mode.default("random") }).strict();

const simulateDraw = z.object({ mode: mode.optional() }).strict();

module.exports = { createDraw, simulateDraw };

// Used by the winner service's internal payout update
const payoutUpdate = z.object({ payoutStatus: z.enum(["pending", "paid"]) }).strict();
module.exports.payoutUpdate = payoutUpdate;
