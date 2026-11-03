const mongoose = require("mongoose");
const Score = require("../models/Score");
const { AppError, toIstIso } = require("@dh/shared");

const MAX = Score.MAX_SCORES_PER_USER;

function assertId(id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid score id", 400);
}

function publicScore(doc) {
  return {
    id: String(doc._id),
    score: doc.score,
    playedOn: doc.playedOn.toISOString().slice(0, 10), // calendar date, same in IST
    enteredAt: doc.createdAt ? toIstIso(doc.createdAt) : null, // when it was logged, in IST
  };
}

function duplicateError() {
  return new AppError("You already have a score for this date. Edit that score instead.", 409);
}

// Keeps only the newest MAX scores for a user. Returns true if the given score survived.
async function enforceRollingWindow(userId, keepId) {
  const newest = await Score.find({ userId }).sort({ playedOn: -1 }).limit(MAX);
  const keepIds = newest.map((s) => String(s._id));
  await Score.deleteMany({ userId, _id: { $nin: keepIds } });
  return keepIds.includes(String(keepId));
}

exports.list = async (req, res) => {
  const scores = await Score.find({ userId: req.user.id }).sort({ playedOn: -1 }).limit(MAX);
  res.json({ success: true, data: { scores: scores.map(publicScore), max: MAX } });
};

exports.create = async (req, res) => {
  const { score, playedOn } = req.body;
  const userId = req.user.id;

  let doc;
  try {
    doc = await Score.create({ userId, score, playedOn });
  } catch (err) {
    if (err.code === 11000) throw duplicateError();
    throw err;
  }

  // If the user already has MAX scores and this one is older than all of them, it is not kept.
  const survived = await enforceRollingWindow(userId, doc._id);
  if (!survived) {
    await Score.deleteOne({ _id: doc._id });
    throw new AppError(
      `This date is older than your ${MAX} most recent scores, so it cannot be added.`,
      409
    );
  }

  res.status(201).json({ success: true, data: { score: publicScore(doc) } });
};

exports.update = async (req, res) => {
  assertId(req.params.id);
  const updates = {};
  if (req.body.score !== undefined) updates.score = req.body.score;
  if (req.body.playedOn !== undefined) updates.playedOn = req.body.playedOn;

  let doc;
  try {
    doc = await Score.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: updates },
      { new: true, runValidators: true }
    );
  } catch (err) {
    if (err.code === 11000) throw duplicateError();
    throw err;
  }
  if (!doc) throw new AppError("Score not found", 404);

  res.json({ success: true, data: { score: publicScore(doc) } });
};

exports.remove = async (req, res) => {
  assertId(req.params.id);
  const doc = await Score.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
  if (!doc) throw new AppError("Score not found", 404);
  res.json({ success: true, data: { deleted: true } });
};

// Admin: view any user's scores (PRD 11: edit golf scores)
exports.adminList = async (req, res) => {
  const filter = {};
  if (req.query.userId) {
    if (!mongoose.isValidObjectId(req.query.userId)) throw new AppError("Invalid user id", 400);
    filter.userId = req.query.userId;
  }
  const scores = await Score.find(filter).sort({ playedOn: -1 }).limit(100);
  res.json({ success: true, data: { scores: scores.map((s) => ({ ...publicScore(s), userId: String(s.userId) })) } });
};

exports.adminUpdate = async (req, res) => {
  assertId(req.params.id);
  let doc;
  try {
    doc = await Score.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
  } catch (err) {
    if (err.code === 11000) throw duplicateError();
    throw err;
  }
  if (!doc) throw new AppError("Score not found", 404);
  res.json({ success: true, data: { score: publicScore(doc) } });
};
