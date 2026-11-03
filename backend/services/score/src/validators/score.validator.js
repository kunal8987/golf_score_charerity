const { z } = require("zod");
const { istDateString } = require("@dh/shared");

const score = z
  .number({ required_error: "Score is required", invalid_type_error: "Score must be a number" })
  .int("Score must be a whole number")
  .min(1, "Score must be between 1 and 45")
  .max(45, "Score must be between 1 and 45");

// Accepts "YYYY-MM-DD" only, rejects impossible dates like 2024-02-31,
// and rejects dates later than today in IST (the user's calendar, not UTC).
// The date is stored at UTC midnight of that same calendar date, so it reads back unchanged.
const playedOn = z
  .string({ required_error: "Date is required", invalid_type_error: "Date must be a string" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine((value) => {
    const d = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }, "Date is not a valid calendar date")
  .refine((value) => value <= istDateString(), "A score cannot be dated in the future")
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

const createScore = z.object({ score, playedOn }).strict();

const updateScore = z
  .object({ score: score.optional(), playedOn: playedOn.optional() })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "Nothing to update" });

module.exports = { createScore, updateScore };
