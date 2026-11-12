const mongoose = require("mongoose");
const { CURRENCY, MIN_DONATION_RUPEES } = require("../constants");

// A one-time donation, separate from the subscription and not tied to gameplay (PRD 08.2)
const donationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    charityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    amount: {
      type: Number, // paise, always a whole number
      required: true,
      min: MIN_DONATION_RUPEES * 100,
      validate: { validator: Number.isInteger, message: "Amount must be whole paise" },
    },
    currency: { type: String, default: CURRENCY },
    status: { type: String, enum: ["pending", "completed", "failed"], default: "pending", index: true },
    stripeSessionId: { type: String, unique: true, sparse: true },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Donation || mongoose.model("Donation", donationSchema);
