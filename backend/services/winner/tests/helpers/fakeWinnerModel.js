// In-memory stand-in for the Winner model. Enforces a unique drawResultId, like the real index.
const { newId, matches, chainFor, duplicateError } = require("./fakeBase");

let docs = [];
const wrap = (raw) => ({ ...raw, toJSON: () => ({ ...raw }) });

const Winner = {
  create(data) {
    if (docs.some((d) => String(d.drawResultId) === String(data.drawResultId))) {
      return Promise.reject(duplicateError());
    }
    const raw = {
      _id: newId(),
      verificationStatus: "awaiting_proof",
      payoutStatus: "pending",
      proof: null,
      rejectionReason: "",
      reviewedAt: null,
      reviewedBy: null,
      paidAt: null,
      paidBy: null,
      createdAt: new Date(),
      ...data,
    };
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

  countDocuments: (filter = {}) => Promise.resolve(docs.filter((d) => matches(d, filter)).length),

  all: () => docs,
  reset() {
    docs = [];
  },
};

module.exports = Winner;
