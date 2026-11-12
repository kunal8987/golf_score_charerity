process.env.LOG_LEVEL = "silent";
const { contributionAmount } = require("../src/services/contribution");

describe("contributionAmount (PRD 08.1)", () => {
  it("gives the 10% minimum from a fee in paise", () => {
    expect(contributionAmount(59900, 10)).toBe(5990); // ₹599 -> ₹59.90
  });

  it("rounds down to whole paise, never over the agreed share", () => {
    expect(contributionAmount(1001, 10)).toBe(100); // 10.01 -> 10.0
  });

  it("allows a user to give 100%", () => {
    expect(contributionAmount(10000, 100)).toBe(10000);
  });

  it.each([9, 101, 10.5])("rejects percentage %p", (pct) => {
    expect(() => contributionAmount(10000, pct)).toThrow(RangeError);
  });

  it("rejects a fee that is not whole paise", () => {
    expect(() => contributionAmount(99.5, 10)).toThrow(RangeError);
  });
});
