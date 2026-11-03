process.env.LOG_LEVEL = "silent";
const { toIstIso, formatIst, istDateString, toIstWallClock } = require("../shared/src/timezone");

describe("UTC to IST conversion", () => {
  it("adds 5 hours 30 minutes to UTC", () => {
    expect(toIstIso(new Date("2024-03-01T00:00:00Z"))).toBe("2024-03-01T05:30:00+05:30");
  });

  it("formats a UTC instant as IST wall-clock time", () => {
    expect(formatIst(new Date("2026-11-01T20:00:00Z"))).toBe("2026-11-02 01:30 IST");
  });

  it("moves the calendar date forward once UTC passes 18:30", () => {
    expect(istDateString(new Date("2026-11-01T18:29:59Z"))).toBe("2026-11-01");
    expect(istDateString(new Date("2026-11-01T18:30:00Z"))).toBe("2026-11-02");
  });

  it("keeps the same instant (only the display changes)", () => {
    const utc = new Date("2026-06-15T12:00:00Z");
    expect(toIstWallClock(utc).getTime() - utc.getTime()).toBe(5.5 * 60 * 60 * 1000);
  });
});
