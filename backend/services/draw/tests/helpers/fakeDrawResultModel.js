// In-memory stand-in for the DrawResult model. Enforces one row per user per draw.
const { newId, matches, chainFor, duplicateError } = require("./fakeBase");

let docs = [];
const wrap = (raw) => ({ ...raw, toJSON: () => ({ ...raw }) });

const DrawResult = {
  insertMany(list) {
    for (const item of list) {
      if (docs.some((d) => String(d.drawId) === String(item.drawId) && String(d.userId) === String(item.userId))) {
        return Promise.reject(duplicateError());
      }
    }
    const created = list.map((item) => ({ _id: newId(), createdAt: new Date(), ...item }));
    docs.push(...created);
    return Promise.resolve(created.map(wrap));
  },

  deleteMany(filter) {
    const before = docs.length;
    docs = docs.filter((d) => !matches(d, filter));
    return Promise.resolve({ deletedCount: before - docs.length });
  },

  find(filter = {}) {
    return chainFor(docs.filter((d) => matches(d, filter)), wrap);
  },

  countDocuments: (filter = {}) => Promise.resolve(docs.filter((d) => matches(d, filter)).length),

  all: () => docs,
  reset() {
    docs = [];
  },
};

module.exports = DrawResult;
