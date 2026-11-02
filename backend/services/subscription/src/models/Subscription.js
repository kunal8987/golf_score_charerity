const mongoose = require("mongoose");

// One subscription record per user. Stripe is the source of truth for billing;
// this record is a local copy that the gateway and other services can read quickly.
const subscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true }, // references User in the auth service
    plan: { type: String, default: null }, // "monthly" | "yearly" | null
    status: {
      type: String,
      enum: ["inactive", "active", "lapsed", "cancelled"],
      default: "inactive",
      index: true,
    },
    stripeCustomerId: { type: String, index: true },
    stripeSubscriptionId: { type: String, unique: true, sparse: true },
    currentPeriodEnd: { type: Date, default: null }, // renewal date shown on the dashboard
    cancelAtPeriodEnd: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);
