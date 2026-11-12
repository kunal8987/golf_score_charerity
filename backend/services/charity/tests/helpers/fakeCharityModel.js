// In-memory stand-in for the Charity model, used only by tests.
const { newId, matches, chainFor, duplicateError } = require("./fakeBase");

let docs = [];
const wrap = (raw) => ({ ...raw, toJSON: () => ({ ...raw }) });

const Charity = {
  create(data) {
    if (docs.some((d) => d.slug === data.slug)) return Promise.reject(duplicateError());
    const raw = {
      _id: newId(),
      active: true,
      featured: false,
      images: [],
      events: [],
      logoUrl: "",
      website: "",
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
    for (const [key, value] of Object.entries(update.$push || {})) {
      raw[key].push({ _id: newId(), ...value });
    }
    for (const [key, value] of Object.entries(update.$pull || {})) {
      raw[key] = raw[key].filter((item) => String(item._id) !== String(value._id));
    }
    return Promise.resolve(wrap(raw));
  },

  countDocuments: (filter = {}) => Promise.resolve(docs.filter((d) => matches(d, filter)).length),

  // Test helpers
  seed(data) {
    const raw = { _id: newId(), active: true, featured: false, images: [], events: [], logoUrl: "", website: "", createdAt: new Date(), ...data };
    docs.push(raw);
    return wrap(raw);
  },
  all: () => docs,
  reset() {
    docs = [];
  },
};

module.exports = Charity;
