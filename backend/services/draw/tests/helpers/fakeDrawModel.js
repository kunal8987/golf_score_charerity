// In-memory stand-in for the Draw model. Enforces the unique month, and supports sort on findOne.
const { newId, matches, chainFor, duplicateError } = require("./fakeBase");

let docs = [];
const wrap = (raw) => ({ ...raw, toJSON: () => ({ ...raw }) });

function sortList(list, spec) {
  const entries = Object.entries(spec);
  return [...list].sort((a, b) => {
    for (const [key, dir] of entries) {
      if (a[key] < b[key]) return -1 * dir;
      if (a[key] > b[key]) return 1 * dir;
    }
    return 0;
  });
}

const Draw = {
  create(data) {
    if (docs.some((d) => d.month === data.month)) return Promise.reject(duplicateError());
    const raw = { _id: newId(), numbers: [], pool: null, winnerCounts: null, publishedAt: null, simulatedAt: null, createdAt: new Date(), ...data };
    docs.push(raw);
    return Promise.resolve(wrap(raw));
  },

  find(filter = {}) {
    return chainFor(docs.filter((d) => matches(d, filter)), wrap);
  },

  // Returns a thenable that also supports .sort(), like Mongoose
  findOne(filter) {
    const pick = (sort) => {
      const list = docs.filter((d) => matches(d, filter));
      const ordered = sort ? sortList(list, sort) : list;
      return ordered[0] ? wrap(ordered[0]) : null;
    };
    const query = {
      sort: (spec) => Promise.resolve(pick(spec)),
      then: (resolve, reject) => Promise.resolve(pick(null)).then(resolve, reject),
    };
    return query;
  },

  findOneAndUpdate(filter, update = {}) {
    const raw = docs.find((d) => matches(d, filter));
    if (!raw) return Promise.resolve(null);
    Object.assign(raw, update.$set || {});
    return Promise.resolve(wrap(raw));
  },

  countDocuments: (filter = {}) => Promise.resolve(docs.filter((d) => matches(d, filter)).length),

  seed(data) {
    const raw = { _id: newId(), numbers: [], pool: null, winnerCounts: null, publishedAt: null, simulatedAt: null, createdAt: new Date(), ...data };
    docs.push(raw);
    return wrap(raw);
  },
  all: () => docs,
  reset() {
    docs = [];
  },
};

module.exports = Draw;
