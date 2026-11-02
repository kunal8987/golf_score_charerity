// In-memory stand-in for the Subscription model, used only by tests.
const crypto = require("crypto");

let docs = [];
const newId = () => crypto.randomBytes(12).toString("hex");

function matches(doc, filter) {
  return Object.entries(filter).every(([key, value]) => String(doc[key]) === String(value));
}

function wrap(raw) {
  return { ...raw, toJSON: () => ({ ...raw }) };
}

const Subscription = {
  findOne(filter) {
    const raw = docs.find((d) => matches(d, filter));
    return Promise.resolve(raw ? wrap(raw) : null);
  },

  findOneAndUpdate(filter, update = {}, opts = {}) {
    let raw = docs.find((d) => matches(d, filter));
    if (!raw) {
      if (!opts.upsert) return Promise.resolve(null);
      raw = { _id: newId(), status: "inactive", plan: null, cancelAtPeriodEnd: false, ...filter };
      docs.push(raw);
    }
    Object.assign(raw, update.$set || {});
    raw.updatedAt = new Date();
    return Promise.resolve(wrap(raw));
  },

  find(filter = {}) {
    let items = docs.filter((d) => matches(d, filter)).map(wrap);
    const chain = {
      sort: () => chain,
      skip: (n) => ((items = items.slice(n)), chain),
      limit: (n) => ((items = items.slice(0, n)), chain),
      then: (resolve, reject) => Promise.resolve(items).then(resolve, reject),
    };
    return chain;
  },

  countDocuments: (filter = {}) => Promise.resolve(docs.filter((d) => matches(d, filter)).length),

  // Test helpers
  seed(data) {
    const raw = { _id: newId(), status: "inactive", plan: null, cancelAtPeriodEnd: false, ...data, createdAt: new Date() };
    docs.push(raw);
    return wrap(raw);
  },
  byUser: (userId) => wrap(docs.find((d) => String(d.userId) === String(userId))),
  reset() {
    docs = [];
  },
};

module.exports = Subscription;
