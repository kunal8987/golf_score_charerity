process.env.LOG_LEVEL = "silent";
const { createScore } = require("../src/validators/score.validator");

// Fixed "now" so the tests do not depend on when they run
function atUtc(iso) {
  jest.useFakeTimers({ now: new Date(iso) });
}
afterEach(() => jest.useRealTimers());

const check = (date) => createScore.safeParse({ score: 30, playedOn: date });

describe("future-date check uses the IST calendar", () => {
  it("accepts today in IST when UTC is still yesterday (1:30 AM IST, 2 Nov)", () => {
    atUtc("2026-11-01T20:00:00Z"); // 2 Nov 01:30 IST, but 1 Nov in UTC
    expect(check("2026-11-02").success).toBe(true);
  });

  it("rejects tomorrow in IST", () => {
    atUtc("2026-11-01T20:00:00Z");
    expect(check("2026-11-03").success).toBe(false);
  });

  it("rejects 2 Nov while it is still 1 Nov in IST (23:30 IST)", () => {
    atUtc("2026-11-01T18:00:00Z"); // 1 Nov 23:30 IST
    expect(check("2026-11-02").success).toBe(false);
  });

  it("accepts yesterday in IST", () => {
    atUtc("2026-11-01T18:00:00Z");
    expect(check("2026-11-01").success).toBe(true);
  });
});

describe("stored date is the same calendar date the user picked", () => {
  it("stores the date at UTC midnight of that calendar day", () => {
    atUtc("2026-11-01T20:00:00Z");
    const result = check("2026-11-02");
    expect(result.data.playedOn.toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });
});
