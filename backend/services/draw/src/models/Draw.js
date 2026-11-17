const mongoose = require("mongoose");
const { MODES } = require("../constants");

// One draw per calendar month. Lifecycle: draft -> simulated -> published (published is final).
const drawSchema = new mongoose.Schema(
  {
    month: {
      type: String,
      required: true,
      unique: true,
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be YYYY-MM"],
    },
    mode: { type: String, enum: MODES, default: "random" },
    status: { type: String, enum: ["draft", "simulated", "published"], default: "draft", index: true },
    numbers: { type: [Number], default: [] },
    pool: { type: mongoose.Schema.Types.Mixed, default: null }, // money breakdown, in paise
    winnerCounts: { type: mongoose.Schema.Types.Mixed, default: null }, // { five, four, three }
    simulatedAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Draw || mongoose.model("Draw", drawSchema);
