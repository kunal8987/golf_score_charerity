// In-memory stand-in for the Mongoose User model, used only by tests.
// Implements just the methods the auth controller calls.
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

let docs = [];

const newId = () => crypto.randomBytes(12).toString("hex");

function wrap(raw) {
  return {
    _id: raw._id,
    name: raw.name,
    email: raw.email,
    role: raw.role,
    charity: { ...raw.charity },
    passwordHash: raw.passwordHash,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    checkPassword(password) {
      return bcrypt.compare(password, raw.passwordHash);
    },
    toJSON() {
      return {
        id: raw._id,
        name: raw.name,
        email: raw.email,
        role: raw.role,
        charity: { ...raw.charity },
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      };
    },
  };
}

function findRaw(id) {
  return docs.find((d) => d._id === id);
}

function setPath(obj, path, value) {
  const keys = path.split(".");
  let target = obj;
  for (const key of keys.slice(0, -1)) target = target[key];
  target[keys[keys.length - 1]] = value;
}

const User = {
  hashPassword: (password) => bcrypt.hash(password, 4), // low cost keeps tests fast

  create(data) {
    if (docs.some((d) => d.email === data.email)) {
      throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
    }
    const raw = {
      _id: newId(),
      role: "subscriber",
      charity: { charityId: null, percentage: 10 },
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    docs.push(raw);
    return Promise.resolve(wrap(raw));
  },

  findOne(query) {
    const raw = docs.find((d) => d.email === query.email);
    const doc = raw ? wrap(raw) : null;
    const promise = Promise.resolve(doc);
    promise.select = () => Promise.resolve(doc);
    return promise;
  },

  findById(id) {
    const raw = findRaw(id);
    return Promise.resolve(raw ? wrap(raw) : null);
  },

  findByIdAndUpdate(id, update) {
    const raw = findRaw(id);
    if (!raw) return Promise.resolve(null);
    for (const [path, value] of Object.entries(update.$set || {})) {
      setPath(raw, path, value);
    }
    raw.updatedAt = new Date();
    return Promise.resolve(wrap(raw));
  },

  find() {
    let items = docs.map(wrap);
    const chain = {
      sort: () => chain,
      skip: (n) => ((items = items.slice(n)), chain),
      limit: (n) => ((items = items.slice(0, n)), chain),
      then: (resolve, reject) => Promise.resolve(items).then(resolve, reject),
    };
    return chain;
  },

  countDocuments: () => Promise.resolve(docs.length),

  // Test helpers
  seed(data) {
    const raw = {
      _id: newId(),
      role: "subscriber",
      charity: { charityId: null, percentage: 10 },
      ...data,
      passwordHash: bcrypt.hashSync(data.password, 4),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    delete raw.password;
    docs.push(raw);
    return wrap(raw);
  },
  reset() {
    docs = [];
  },
};

module.exports = User;
