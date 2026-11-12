// In-memory stand-in for the Donation model, used only by tests.
const { newId, matches, chainFor } = require("./fakeBase");

let docs = [];
const wrap = (raw) => ({ ...raw, toJSON: () => ({ ...raw }) });

// Supports the $match, $group and $sort stages the admin report uses
function runPipeline(pipeline) {
  let rows = docs;
  for (const stage of pipeline) {
    if (stage.$match) {
      rows = rows.filter((d) => matches(d, stage.$match));
    } else if (stage.$group) {
      const groups = new Map();
      const field = (expr, d) => (expr.startsWith("$") ? d[expr.slice(1)] : expr);
      for (const d of rows) {
        const key = String(field(stage.$group._id, d));
        if (!groups.has(key)) groups.set(key, { _id: field(stage.$group._id, d) });
        const g = groups.get(key);
        for (const [name, spec] of Object.entries(stage.$group)) {
          if (name === "_id") continue;
          const amount = typeof spec.$sum === "number" ? spec.$sum : field(spec.$sum, d);
          g[name] = (g[name] || 0) + Number(amount);
        }
      }
      rows = [...groups.values()];
    } else if (stage.$sort) {
      const [[key, dir]] = Object.entries(stage.$sort);
      rows = [...rows].sort((a, b) => (a[key] - b[key]) * dir);
    }
  }
  return rows;
}

const Donation = {
  create(data) {
    const raw = { _id: newId(), status: "pending", completedAt: null, createdAt: new Date(), ...data };
    docs.push(raw);
    return Promise.resolve(wrap(raw));
  },

  find(filter = {}) {
    return chainFor(docs.filter((d) => matches(d, filter)), wrap);
  },

  findOne(filter) {
    const raw = docs.find((d) => matches(d, filter));
    return Promise.resolve(raw ? wrap(raw) : null);
  },

  findOneAndUpdate(filter, update = {}) {
    const raw = docs.find((d) => matches(d, filter));
    if (!raw) return Promise.resolve(null);
    Object.assign(raw, update.$set || {});
    return Promise.resolve(wrap(raw));
  },

  aggregate: (pipeline) => Promise.resolve(runPipeline(pipeline)),

  // Test helpers
  seed(data) {
    const raw = { _id: newId(), status: "pending", completedAt: null, createdAt: new Date(), ...data };
    docs.push(raw);
    return wrap(raw);
  },
  all: () => docs,
  reset() {
    docs = [];
  },
};

module.exports = Donation;
