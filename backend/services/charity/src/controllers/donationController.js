const Charity = require("../models/Charity");
const Donation = require("../models/Donation");
const { AppError } = require("@dh/shared");
const { getStripe } = require("../services/stripe");
const { CURRENCY } = require("../constants");

const clientUrl = () => process.env.CLIENT_URL || "http://localhost:3000";

exports.create = async (req, res) => {
  const { charityId, amountInr } = req.body;
  const charity = await Charity.findOne({ _id: charityId, active: true });
  if (!charity) throw new AppError("Charity not found", 404);

  const amount = amountInr * 100; // rupees to paise
  const donation = await Donation.create({
    userId: req.user.id,
    charityId,
    amount,
    currency: CURRENCY,
    status: "pending",
  });

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: amount,
            product_data: { name: `Donation to ${charity.name}` },
          },
        },
      ],
      // The webhook uses this metadata to find the donation
      metadata: { type: "donation", donationId: String(donation._id), charityId: String(charity._id) },
      client_reference_id: String(donation._id),
      success_url: `${clientUrl()}/charities/${charity.slug}?donation=success`,
      cancel_url: `${clientUrl()}/charities/${charity.slug}?donation=cancelled`,
    });

    await Donation.findOneAndUpdate({ _id: donation._id }, { $set: { stripeSessionId: session.id } });
    res.status(201).json({ success: true, data: { donationId: String(donation._id), url: session.url } });
  } catch (err) {
    await Donation.findOneAndUpdate({ _id: donation._id }, { $set: { status: "failed" } });
    throw err;
  }
};

exports.mine = async (req, res) => {
  const donations = await Donation.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(50);
  res.json({
    success: true,
    data: {
      donations: donations.map((d) => ({
        id: String(d._id),
        charityId: String(d.charityId),
        amountInr: d.amount / 100,
        status: d.status,
        createdAt: d.createdAt,
        completedAt: d.completedAt,
      })),
    },
  });
};

// Admin: completed donations per charity (PRD 11: charity contribution totals)
exports.adminReport = async (req, res) => {
  const rows = await Donation.aggregate([
    { $match: { status: "completed" } },
    { $group: { _id: "$charityId", totalPaise: { $sum: "$amount" }, donations: { $sum: 1 } } },
    { $sort: { totalPaise: -1 } },
  ]);

  const ids = rows.map((r) => r._id);
  const charities = ids.length ? await Charity.find({ _id: { $in: ids } }) : [];
  const names = new Map(charities.map((c) => [String(c._id), c.name]));

  const perCharity = rows.map((r) => ({
    charityId: String(r._id),
    name: names.get(String(r._id)) || "(deleted charity)",
    totalInr: r.totalPaise / 100,
    donations: r.donations,
  }));
  const totalInr = perCharity.reduce((sum, c) => sum + c.totalInr, 0);
  res.json({ success: true, data: { totalInr, perCharity } });
};
