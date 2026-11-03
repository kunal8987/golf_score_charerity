const mongoose = require("mongoose");

const MAX_SCORES_PER_USER = 5; // PRD 05: only the latest 5 scores are kept

const scoreSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true }, // references User in the auth service
    score: {
      type: Number,
      required: true,
      min: [1, "Score must be at least 1"],
      max: [45, "Score must be at most 45"],
      validate: { validator: Number.isInteger, message: "Score must be a whole number" },
    },
    playedOn: { type: Date, required: true }, // stored at UTC midnight: one date, one score
  },
  { timestamps: true }
);

// One score per user per date (PRD 05). Enforced by the database, not just the code.
scoreSchema.index({ userId: 1, playedOn: 1 }, { unique: true });

scoreSchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.models.Score || mongoose.model("Score", scoreSchema);
module.exports.MAX_SCORES_PER_USER = MAX_SCORES_PER_USER;
