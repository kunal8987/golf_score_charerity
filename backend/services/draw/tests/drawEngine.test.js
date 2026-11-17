process.env.LOG_LEVEL = "silent";
const engine = require("../src/services/drawEngine");

const isValidDraw = (numbers) =>
  numbers.length === 5 &&
  new Set(numbers).size === 5 &&
  numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= 45) &&
  numbers.every((n, i) => i === 0 || numbers[i - 1] < n);

describe("generating the drawn numbers", () => {
  it("random draws are 5 distinct sorted numbers from 1 to 45", () => {
    for (let i = 0; i < 300; i += 1) {
      expect(isValidDraw(engine.generateNumbers("random"))).toBe(true);
    }
  });

  it("algorithmic draws are also valid", () => {
    for (let i = 0; i < 300; i += 1) {
      expect(isValidDraw(engine.generateNumbers("algorithmic", engine.frequencyWeights([[1, 2, 3]])))).toBe(true);
    }
  });

  it("algorithmic draws favour a heavily weighted number", () => {
    const weights = engine.frequencyWeights([Array(200).fill(7)]); // 7 appears 200 times
    let included = 0;
    for (let i = 0; i < 300; i += 1) {
      if (engine.generateNumbers("algorithmic", weights).includes(7)) included += 1;
    }
    expect(included).toBeGreaterThanOrEqual(285);
  });

  it("rejects an unknown mode", () => {
    expect(() => engine.generateNumbers("lucky")).toThrow(RangeError);
  });
});

describe("frequency weights", () => {
  it("counts every occurrence and starts each number at 1", () => {
    const w = engine.frequencyWeights([[5, 5, 9], [5]]);
    expect(w[5]).toBe(4); // 1 + three appearances
    expect(w[9]).toBe(2);
    expect(w[1]).toBe(1); // never zero, so every number is possible
  });
});

describe("matching and tiers", () => {
  it("counts distinct drawn numbers, so a repeated score counts once", () => {
    expect(engine.matchCount([1, 1, 2, 3, 4], [1, 2, 3, 4, 5])).toBe(4);
  });

  it.each([
    [5, "five"],
    [4, "four"],
    [3, "three"],
    [2, null],
    [0, null],
  ])("%i matches gives tier %p", (matches, tier) => {
    expect(engine.tierFor(matches)).toBe(tier);
  });
});

describe("prize pool (PRD 07)", () => {
  const base = { numbers: [20, 21, 22, 23, 24], subscriberCount: 3, contributionPerSubscriberPaise: 10000 };

  it("splits the pool 40/35/25 by tier", () => {
    const o = engine.computeOutcome({ ...base, entries: [] });
    expect(o.pool.totalPaise).toBe(30000);
    expect(o.pool.fiveTierPaise).toBe(12000);
    expect(o.pool.fourTierPaise).toBe(10500);
    expect(o.pool.threeTierPaise).toBe(7500);
  });

  it("rolls the 5-match jackpot over when nobody wins it", () => {
    const o = engine.computeOutcome({ ...base, entries: [{ userId: "a", scores: [1, 2, 3, 4, 5] }] });
    expect(o.winnerCounts.five).toBe(0);
    expect(o.pool.rolloverOutPaise).toBe(12000);
  });

  it("gives a single 5-match winner the whole jackpot", () => {
    const o = engine.computeOutcome({ ...base, numbers: [1, 2, 3, 4, 5], entries: [{ userId: "a", scores: [1, 2, 3, 4, 5] }] });
    expect(o.results[0].prizePaise).toBe(12000);
    expect(o.pool.rolloverOutPaise).toBe(0);
  });

  it("splits a tier equally between its winners", () => {
    const o = engine.computeOutcome({
      ...base,
      numbers: [1, 2, 3, 4, 5],
      entries: [
        { userId: "a", scores: [1, 2, 3, 4, 5] },
        { userId: "b", scores: [5, 4, 3, 2, 1] },
      ],
    });
    expect(o.results.map((r) => r.prizePaise)).toEqual([6000, 6000]);
  });

  it("keeps leftover paise from an uneven split in the rollover", () => {
    const o = engine.computeOutcome({
      ...base,
      numbers: [1, 2, 3, 4, 5],
      jackpotCarryInPaise: 1, // fiveAvailable = 12001 across two winners
      entries: [
        { userId: "a", scores: [1, 2, 3, 4, 5] },
        { userId: "b", scores: [1, 2, 3, 4, 5] },
      ],
    });
    expect(o.results.map((r) => r.prizePaise)).toEqual([6000, 6000]);
    expect(o.pool.rolloverOutPaise).toBe(1);
  });

  it("carries the previous jackpot into this draw's 5-match tier", () => {
    const o = engine.computeOutcome({ ...base, jackpotCarryInPaise: 12000, entries: [] });
    expect(o.pool.fiveAvailablePaise).toBe(24000);
    expect(o.pool.rolloverOutPaise).toBe(24000);
  });

  it("handles a month with no subscribers", () => {
    const o = engine.computeOutcome({ ...base, subscriberCount: 0, entries: [] });
    expect(o.pool.totalPaise).toBe(0);
    expect(o.pool.rolloverOutPaise).toBe(0);
  });

  it("never creates or loses money, for any inputs", () => {
    for (let trial = 0; trial < 500; trial += 1) {
      const subscriberCount = Math.floor(Math.random() * 60);
      const contribution = Math.floor(Math.random() * 20000);
      const carry = Math.floor(Math.random() * 50000);
      const numbers = engine.generateNumbers("random");
      const entries = Array.from({ length: Math.floor(Math.random() * 15) }, (_, i) => ({
        userId: `u${i}`,
        scores: Array.from({ length: 5 }, () => 1 + Math.floor(Math.random() * 45)),
      }));
      const o = engine.computeOutcome({
        numbers,
        entries,
        subscriberCount,
        contributionPerSubscriberPaise: contribution,
        jackpotCarryInPaise: carry,
      });
      const p = o.pool;
      expect(p.paidPaise + p.rolloverOutPaise + p.forfeitPaise).toBe(p.totalPaise + p.jackpotCarryInPaise);
      expect(p.rolloverOutPaise).toBeGreaterThanOrEqual(0);
      expect(p.forfeitPaise).toBeGreaterThanOrEqual(0);
      expect(o.results.every((r) => r.prizePaise >= 0)).toBe(true);
    }
  });
});
