// In-memory stand-in for the Score model, used only by tests.
// It enforces the same one-score-per-date rule as the unique index.
const crypto = require("crypto");

let docs = [];
const newId = () => crypto.randomBytes(12).toString("hex");

function matches(doc, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === "object" && "$nin" in value) {
      return !value.$nin.map(String).includes(String(doc[key]));
    }
    return String(doc[key]) === String(value);
  });
}

function wrap(raw) {
  return { ...raw, toJSON: () => ({ ...raw, id: raw._id }) };
}

function duplicateDate(userId, playedOn, exceptId) {
  return docs.some(
    (d) => d.userId === String(userId) && d.playedOn.getTime() === playedOn.getTime() && d._id !== exceptId
  );
}

const duplicateError = () => Object.assign(new Error("E11000 duplicate key"), { code: 11000 });

function chainFor(list) {
  let items = [...list];
  const chain = {
    sort(spec) {
      const [key, dir] = Object.entries(spec)[0];
      items.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (dir < 0 ? -1 : 1));
      return chain;
    },
    skip: (n) => ((items = items.slice(n)), chain),
    limit: (n) => ((items = items.slice(0, n)), chain),
    then: (resolve, reject) => Promise.resolve(items.map(wrap)).then(resolve, reject),
  };
  return chain;
}

const Score = {
  MAX_SCORES_PER_USER: 5,

  create(data) {
    if (duplicateDate(data.userId, data.playedOn)) return Promise.reject(duplicateError());
    const raw = { _id: newId(), createdAt: new Date(), ...data, userId: String(data.userId) };
    docs.push(raw);
    return Promise.resolve(wrap(raw));
  },

  find(filter = {}) {
    return chainFor(docs.filter((d) => matches(d, filter)));
  },

  findOne(filter) {
    const raw = docs.find((d) => matches(d, filter));
    return Promise.resolve(raw ? wrap(raw) : null);
  },

  findOneAndUpdate(filter, update = {}) {
    const raw = docs.find((d) => matches(d, filter));
    if (!raw) return Promise.resolve(null);
    const set = update.$set || {};
    if (set.playedOn && duplicateDate(raw.userId, set.playedOn, raw._id)) return Promise.reject(duplicateError());
    Object.assign(raw, set);
    return Promise.resolve(wrap(raw));
  },

  findByIdAndUpdate(id, update, opts) {
    return Score.findOneAndUpdate({ _id: id }, update, opts);
  },

  findOneAndDelete(filter) {
    const raw = docs.find((d) => matches(d, filter));
    if (!raw) return Promise.resolve(null);
    docs = docs.filter((d) => d !== raw);
    return Promise.resolve(wrap(raw));
  },

  deleteOne(filter) {
    const before = docs.length;
    const idx = docs.findIndex((d) => matches(d, filter));
    if (idx >= 0) docs.splice(idx, 1);
    return Promise.resolve({ deletedCount: before - docs.length });
  },

  deleteMany(filter) {
    const before = docs.length;
    docs = docs.filter((d) => !matches(d, filter));
    return Promise.resolve({ deletedCount: before - docs.length });
  },

  // Test helpers
  all: () => docs,
  reset() {
    docs = [];
  },
};

module.exports = Score;
