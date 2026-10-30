const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/User");
const { AppError, signToken, cookieOptions, COOKIE_NAME } = require("@dh/shared");

// Used when the email is unknown, so login takes the same time either way
// and cannot be used to discover which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync("timing-equaliser-not-a-real-password", 12);

function setSessionCookie(res, user) {
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
}

exports.signup = async (req, res) => {
  const { name, email, password, charityId, charityPercentage } = req.body;

  const passwordHash = await User.hashPassword(password);
  let user;
  try {
    user = await User.create({
      name,
      email,
      passwordHash,
      charity: { charityId: charityId || null, percentage: charityPercentage ?? 10 },
    });
  } catch (err) {
    // Unique index on email catches duplicates, including race conditions
    if (err.code === 11000) throw new AppError("An account with this email already exists", 409);
    throw err;
  }

  setSessionCookie(res, user);
  res.status(201).json({ success: true, data: { user } });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select("+passwordHash");
  const valid = user
    ? await user.checkPassword(password)
    : await bcrypt.compare(password, DUMMY_HASH);

  if (!user || !valid) throw new AppError("Invalid email or password", 401);

  setSessionCookie(res, user);
  res.json({ success: true, data: { user } });
};

exports.logout = (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ success: true, data: { loggedOut: true } });
};

exports.me = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new AppError("Account not found", 404);
  res.json({ success: true, data: { user } });
};

exports.updateMe = async (req, res) => {
  // Build $set explicitly so only profile fields can change, never role
  const update = {};
  if (req.body.name !== undefined) update.name = req.body.name;
  if (req.body.charityId !== undefined) update["charity.charityId"] = req.body.charityId;
  if (req.body.charityPercentage !== undefined) update["charity.percentage"] = req.body.charityPercentage;

  const user = await User.findByIdAndUpdate(
    req.user.id,
    { $set: update },
    { new: true, runValidators: true }
  );
  if (!user) throw new AppError("Account not found", 404);
  res.json({ success: true, data: { user } });
};

exports.listUsers = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

  const [users, total] = await Promise.all([
    User.find({}).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments({}),
  ]);
  res.json({ success: true, data: { users, page, limit, total } });
};

exports.updateUser = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid user id", 400);

  // Stop an admin from locking themselves out by removing their own admin role
  if (id === req.user.id && req.body.role && req.body.role !== "admin") {
    throw new AppError("You cannot remove your own admin role", 400);
  }

  const user = await User.findByIdAndUpdate(id, { $set: req.body }, { new: true, runValidators: true });
  if (!user) throw new AppError("User not found", 404);
  res.json({ success: true, data: { user } });
};
