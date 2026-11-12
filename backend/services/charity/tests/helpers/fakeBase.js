// Shared helpers for the in-memory test models: query matching and chainable find().
const crypto = require("crypto");

const newId = () => crypto.randomBytes(12).toString("hex");

function matchValue(actual, expected) {
  if (expected instanceof RegExp) return expected.test(String(actual ?? ""));
  if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
  if (expected && typeof expected === "object") {
    if ("$in" in expected) return expected.$in.map(String).includes(String(actual));
    if ("$nin" in expected) return !expected.$nin.map(String).includes(String(actual));
  }
  return String(actual) === String(expected);
}

function matches(doc, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some((sub) => matches(doc, sub));
    return matchValue(doc[key], value);
  });
}

function chainFor(items, wrap) {
  let list = [...items];
  const chain = {
    sort(spec) {
      const entries = Object.entries(spec);
      list.sort((a, b) => {
        for (const [key, dir] of entries) {
          if (a[key] < b[key]) return -1 * dir;
          if (a[key] > b[key]) return 1 * dir;
        }
        return 0;
      });
      return chain;
    },
    skip(n) {
      list = list.slice(n);
      return chain;
    },
    limit(n) {
      list = list.slice(0, n);
      return chain;
    },
    then: (resolve, reject) => Promise.resolve(list.map(wrap)).then(resolve, reject),
  };
  return chain;
}

const duplicateError = () => Object.assign(new Error("E11000 duplicate key"), { code: 11000 });

module.exports = { newId, matches, chainFor, duplicateError };
