const mongoose = require("mongoose");

// One row per entrant per draw: the user's scores, how many matched, and the prize.
const drawResultSchema = new mongoose.Schema(
  {
    drawId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    scores: { type: [Number], default: [] }, // the 5 scores that were entered
    matches: { type: Number, min: 0, max: 5, default: 0 },
    tier: { type: String, default: null }, // "five" | "four" | "three" | null (not a winner)
    prizePaise: { type: Number, default: 0, min: 0 },
    payoutStatus: { type: String, default: null }, // "pending" | "paid" for winners; the winner service updates it
  },
  { timestamps: true }
);

drawResultSchema.index({ drawId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.DrawResult || mongoose.model("DrawResult", drawResultSchema);
