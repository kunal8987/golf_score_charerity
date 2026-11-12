const mongoose = require("mongoose");
const Charity = require("../models/Charity");
const { AppError, formatIst } = require("@dh/shared");
const { CATEGORIES } = require("../constants");
const { slugify } = require("../services/slug");

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function assertId(id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid id", 400);
}

function publicEvent(e) {
  return {
    id: String(e._id),
    title: e.title,
    date: e.date.toISOString(),
    dateIst: formatIst(e.date), // same moment, shown in India time
    location: e.location || "",
    description: e.description || "",
  };
}

// Only events that have not happened yet, soonest first (PRD 08.2)
function upcomingEvents(charity) {
  const now = new Date();
  return (charity.events || [])
    .filter((e) => e.date > now)
    .sort((a, b) => a.date - b.date)
    .map(publicEvent);
}

function charityCard(c) {
  return {
    id: String(c._id),
    name: c.name,
    slug: c.slug,
    description: c.description,
    category: c.category,
    logoUrl: c.logoUrl || "",
    featured: c.featured,
    upcomingEventCount: upcomingEvents(c).length,
  };
}

function charityDetail(c) {
  return {
    ...charityCard(c),
    website: c.website || "",
    images: c.images || [],
    upcomingEvents: upcomingEvents(c),
  };
}

function adminView(c) {
  return {
    ...charityDetail(c),
    active: c.active,
    events: (c.events || []).map(publicEvent),
  };
}

async function uniqueSlug(name) {
  const base = slugify(name) || "charity";
  let slug = base;
  for (let n = 2; await Charity.findOne({ slug }); n += 1) {
    if (n > 100) throw new AppError("Could not create a unique URL for this charity", 409);
    slug = `${base}-${n}`;
  }
  return slug;
}

// ---------- public ----------

exports.directory = async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const category = req.query.category;
  if (category !== undefined && !CATEGORIES.includes(category)) {
    throw new AppError("Unknown category", 400);
  }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));

  const filter = { active: true };
  if (category) filter.category = category;
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: pattern }, { description: pattern }];
  }

  const [charities, total] = await Promise.all([
    Charity.find(filter).sort({ featured: -1, name: 1 }).skip((page - 1) * limit).limit(limit),
    Charity.countDocuments(filter),
  ]);
  res.json({ success: true, data: { charities: charities.map(charityCard), page, limit, total } });
};

exports.spotlight = async (req, res) => {
  const charities = await Charity.find({ active: true, featured: true }).sort({ name: 1 }).limit(3);
  res.json({ success: true, data: { charities: charities.map(charityCard) } });
};

exports.detail = async (req, res) => {
  assertId(req.params.id);
  const charity = await Charity.findOne({ _id: req.params.id, active: true });
  if (!charity) throw new AppError("Charity not found", 404);
  res.json({ success: true, data: { charity: charityDetail(charity) } });
};

// ---------- admin ----------

exports.adminCreate = async (req, res) => {
  const slug = await uniqueSlug(req.body.name);
  const charity = await Charity.create({ ...req.body, slug });
  res.status(201).json({ success: true, data: { charity: adminView(charity) } });
};

exports.adminUpdate = async (req, res) => {
  assertId(req.params.id);
  const charity = await Charity.findOneAndUpdate(
    { _id: req.params.id },
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!charity) throw new AppError("Charity not found", 404);
  res.json({ success: true, data: { charity: adminView(charity) } });
};

// Soft delete: the charity disappears from the public site but past donations keep a valid reference
exports.adminDelete = async (req, res) => {
  assertId(req.params.id);
  const charity = await Charity.findOneAndUpdate(
    { _id: req.params.id },
    { $set: { active: false, featured: false } },
    { new: true }
  );
  if (!charity) throw new AppError("Charity not found", 404);
  res.json({ success: true, data: { deactivated: true } });
};

exports.adminAddEvent = async (req, res) => {
  assertId(req.params.id);
  const charity = await Charity.findOneAndUpdate(
    { _id: req.params.id },
    { $push: { events: req.body } },
    { new: true }
  );
  if (!charity) throw new AppError("Charity not found", 404);
  const added = charity.events[charity.events.length - 1];
  res.status(201).json({ success: true, data: { event: publicEvent(added) } });
};

exports.adminDeleteEvent = async (req, res) => {
  assertId(req.params.id);
  assertId(req.params.eventId);
  const charity = await Charity.findOne({ _id: req.params.id });
  if (!charity) throw new AppError("Charity not found", 404);
  const exists = charity.events.some((e) => String(e._id) === req.params.eventId);
  if (!exists) throw new AppError("Event not found", 404);

  await Charity.findOneAndUpdate({ _id: req.params.id }, { $pull: { events: { _id: req.params.eventId } } });
  res.json({ success: true, data: { deleted: true } });
};

exports.adminList = async (req, res) => {
  const charities = await Charity.find({}).sort({ name: 1 }).limit(200);
  res.json({ success: true, data: { charities: charities.map(adminView) } });
};

