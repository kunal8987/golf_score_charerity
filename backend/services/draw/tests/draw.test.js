process.env.LOG_LEVEL = "silent";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-at-least-thirty-two-characters";
process.env.CONTRIBUTION_PER_SUBSCRIBER_PAISE = "10000"; // ₹100 per subscriber, so the maths is easy to check

jest.mock("../src/models/Draw", () => require("./helpers/fakeDrawModel"));
jest.mock("../src/models/DrawResult", () => require("./helpers/fakeDrawResultModel"));
jest.mock("../src/services/subscriptionClient", () => ({ fetchActiveSubscriberIds: jest.fn() }));
jest.mock("../src/services/scoreClient", () => ({ fetchLatestScores: jest.fn() }));

const request = require("supertest");
const { notFound, errorHandler, signToken } = require("@dh/shared");
const Draw = require("./helpers/fakeDrawModel");
const DrawResult = require("./helpers/fakeDrawResultModel");
const subscriptions = require("../src/services/subscriptionClient");
const scoreClient = require("../src/services/scoreClient");
const engine = require("../src/services/drawEngine");
const { createApp } = require("../src/app");
const { ensureDraftForMonth } = require("../src/jobs/monthlyDraw");

const app = createApp();
app.use(notFound);
app.use(errorHandler);

// Three active subscribers: A holds 5 scores, B holds 5, C holds only 3 (not entered)
const A = "5f0000000000000000000001";
const B = "5f0000000000000000000002";
const C = "5f0000000000000000000003";
const adminToken = signToken({ _id: "5f0000000000000000000009", role: "admin" });
const aToken = signToken({ _id: A, role: "subscriber" });
const auth = (token) => ({ Authorization: `Bearer ${token}` });

const WINNING = [1, 2, 3, 4, 5];
const MISSING = [20, 21, 22, 23, 24];

beforeEach(() => {
  Draw.reset();
  DrawResult.reset();
  jest.restoreAllMocks();
  subscriptions.fetchActiveSubscriberIds.mockResolvedValue([A, B, C]);
  scoreClient.fetchLatestScores.mockResolvedValue({
    [A]: [1, 2, 3, 4, 5],
    [B]: [10, 11, 12, 13, 14],
    [C]: [1, 2, 3],
  });
  jest.spyOn(engine, "generateNumbers").mockReturnValue(WINNING);
});

// Creates a draft and simulates it, returning the draw id
async function simulated(month = "2026-10", mode) {
  const created = await request(app).post("/admin/draws").set(auth(adminToken)).send({ month });
  const id = created.body.data.draw.id;
  const sim = await request(app)
    .post(`/admin/draws/${id}/simulate`)
    .set(auth(adminToken))
    .send(mode ? { mode } : {});
  expect(sim.status).toBe(200);
  return id;
}

describe("access", () => {
  it("subscribers cannot create or publish draws", async () => {
    const res = await request(app).post("/admin/draws").set(auth(aToken)).send({ month: "2026-10" });
    expect(res.status).toBe(403);
  });

  it("the public cannot see draws", async () => {
    expect((await request(app).get("/draws/latest")).status).toBe(401);
  });
});

describe("creating draws", () => {
  it("creates a draft, and refuses a second draw for the same month", async () => {
    const first = await request(app).post("/admin/draws").set(auth(adminToken)).send({ month: "2026-10" });
    expect(first.status).toBe(201);
    expect(first.body.data.draw).toMatchObject({ month: "2026-10", status: "draft", mode: "random" });

    const second = await request(app).post("/admin/draws").set(auth(adminToken)).send({ month: "2026-10" });
    expect(second.status).toBe(409);
  });

  it("rejects a malformed month and an unknown mode", async () => {
    expect((await request(app).post("/admin/draws").set(auth(adminToken)).send({ month: "2026-13" })).status).toBe(400);
    expect(
      (await request(app).post("/admin/draws").set(auth(adminToken)).send({ month: "2026-10", mode: "lucky" })).status
    ).toBe(400);
  });

  it("the monthly job creates a draft once and then does nothing", async () => {
    expect(await ensureDraftForMonth("2026-11")).not.toBeNull();
    expect(await ensureDraftForMonth("2026-11")).toBeNull();
    expect(Draw.all().filter((d) => d.month === "2026-11")).toHaveLength(1);
  });
});

describe("simulation", () => {
  it("enters only subscribers with 5 scores and sizes the pool on all active subscribers", async () => {
    const id = await simulated();
    const draw = Draw.all().find((d) => String(d._id) === id);

    expect(draw.status).toBe("simulated");
    expect(draw.numbers).toEqual(WINNING);
    expect(draw.pool.subscriberCount).toBe(3);
    expect(draw.pool.totalPaise).toBe(30000);
    expect(draw.pool.fiveTierPaise).toBe(12000);
    expect(draw.pool.fourTierPaise).toBe(10500);
    expect(draw.pool.threeTierPaise).toBe(7500);
    expect(draw.winnerCounts).toEqual({ five: 1, four: 0, three: 0 });

    const entered = DrawResult.all().map((r) => String(r.userId)).sort();
    expect(entered).toEqual([A, B].sort()); // C has only 3 scores, so is not entered
    const winner = DrawResult.all().find((r) => String(r.userId) === A);
    expect(winner).toMatchObject({ tier: "five", matches: 5, prizePaise: 12000, payoutStatus: "pending" });
  });

  it("running the simulation again replaces the old results", async () => {
    const id = await simulated();
    await request(app).post(`/admin/draws/${id}/simulate`).set(auth(adminToken)).send({});
    expect(DrawResult.all()).toHaveLength(2);
  });

  it("can switch to the algorithmic mode when simulating", async () => {
    await simulated("2026-10", "algorithmic");
    const draw = Draw.all()[0];
    expect(draw.mode).toBe("algorithmic");
    expect(engine.generateNumbers).toHaveBeenLastCalledWith("algorithmic", expect.any(Object));
  });

  it("a month with no winners rolls the jackpot forward", async () => {
    engine.generateNumbers.mockReturnValue(MISSING);
    const id = await simulated("2026-10");
    const draw = Draw.all().find((d) => String(d._id) === id);
    expect(draw.winnerCounts.five).toBe(0);
    expect(draw.pool.rolloverOutPaise).toBe(12000);
    await request(app).post(`/admin/draws/${id}/publish`).set(auth(adminToken));

    engine.generateNumbers.mockReturnValue(WINNING);
    const nextId = await simulated("2026-11");
    const next = Draw.all().find((d) => String(d._id) === nextId);
    expect(next.pool.jackpotCarryInPaise).toBe(12000);
    expect(next.pool.fiveAvailablePaise).toBe(24000);
  });
});

describe("publishing", () => {
  it("cannot publish a draw that has not been simulated", async () => {
    const created = await request(app).post("/admin/draws").set(auth(adminToken)).send({ month: "2026-10" });
    const res = await request(app).post(`/admin/draws/${created.body.data.draw.id}/publish`).set(auth(adminToken));
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/Simulate/);
  });

  it("locks the draw once published", async () => {
    const id = await simulated();
    expect((await request(app).post(`/admin/draws/${id}/publish`).set(auth(adminToken))).status).toBe(200);
    expect((await request(app).post(`/admin/draws/${id}/publish`).set(auth(adminToken))).status).toBe(409);
    expect((await request(app).post(`/admin/draws/${id}/simulate`).set(auth(adminToken)).send({})).status).toBe(409);
  });

  it("rejects a malformed draw id", async () => {
    const res = await request(app).get("/admin/draws/not-an-id").set(auth(adminToken));
    expect(res.status).toBe(400);
  });
});

describe("what subscribers see", () => {
  it("shows nothing until a draw is published", async () => {
    await simulated();
    const res = await request(app).get("/draws/latest").set(auth(aToken));
    expect(res.body.data.draw).toBeNull();
  });

  it("shows the published numbers and pool in rupees", async () => {
    const id = await simulated();
    await request(app).post(`/admin/draws/${id}/publish`).set(auth(adminToken));
    const res = await request(app).get("/draws/latest").set(auth(aToken));

    expect(res.body.data.draw.numbers).toEqual(WINNING);
    expect(res.body.data.draw.pool).toMatchObject({ totalInr: 300, fiveMatchInr: 120, fourMatchInr: 105, threeMatchInr: 75 });
  });

  it("gives each user their own results only", async () => {
    const id = await simulated();
    await request(app).post(`/admin/draws/${id}/publish`).set(auth(adminToken));

    const res = await request(app).get("/draws/me").set(auth(aToken));
    expect(res.body.data.entries).toBe(1);
    expect(res.body.data.history[0]).toMatchObject({
      month: "2026-10",
      matches: 5,
      tier: "five",
      prizeInr: 120,
      payoutStatus: "pending",
    });
  });

  it("does not show a user results for an unpublished draw", async () => {
    await simulated();
    const res = await request(app).get("/draws/me").set(auth(aToken));
    expect(res.body.data.entries).toBe(0);
  });

  it("shows the next draw month to the user", async () => {
    await request(app).post("/admin/draws").set(auth(adminToken)).send({ month: "2026-12" });
    const res = await request(app).get("/draws/me").set(auth(aToken));
    expect(res.body.data.upcoming).toEqual({ month: "2026-12" });
  });
});

describe("admin views and reports", () => {
  it("lists the winners and the number of entrants", async () => {
    const id = await simulated();
    const res = await request(app).get(`/admin/draws/${id}`).set(auth(adminToken));
    expect(res.body.data.winners).toHaveLength(1);
    expect(res.body.data.winners[0]).toMatchObject({ userId: A, tier: "five", prizeInr: 120 });
    expect(res.body.data.entrantCount).toBe(2);
  });

  it("totals the published draws, including forfeits", async () => {
    const id = await simulated();
    await request(app).post(`/admin/draws/${id}/publish`).set(auth(adminToken));

    const res = await request(app).get("/admin/reports/draws").set(auth(adminToken));
    expect(res.body.data).toMatchObject({
      publishedDraws: 1,
      totalPoolInr: 300,
      paidOutInr: 120,
      forfeitedInr: 180,
      jackpotRolloverInr: 0,
      winnersByTier: { five: 1, four: 0, three: 0 },
    });
  });

  it("is closed to subscribers", async () => {
    expect((await request(app).get("/admin/reports/draws").set(auth(aToken))).status).toBe(403);
  });
});

describe("internal endpoints for the winner service", () => {
  const key = { "x-internal-key": "internal-test-key-0123456789abcdef" };
  beforeAll(() => {
    process.env.INTERNAL_API_KEY = "internal-test-key-0123456789abcdef";
  });

  it("requires the internal key", async () => {
    expect((await request(app).get("/internal/winners")).status).toBe(403);
  });

  it("lists winners from published draws only, with their month", async () => {
    const id = await simulated();
    await request(app).post(`/admin/draws/${id}/publish`).set(auth(adminToken));
    await simulated("2026-11"); // not published, so its winners must not appear

    const res = await request(app).get("/internal/winners").set(key);
    expect(res.body.data.winners).toHaveLength(1);
    expect(res.body.data.winners[0]).toMatchObject({ userId: A, tier: "five", month: "2026-10", prizePaise: 12000 });
  });

  it("mirrors a payout status onto the entry", async () => {
    const id = await simulated();
    await request(app).post(`/admin/draws/${id}/publish`).set(auth(adminToken));
    const winner = (await request(app).get("/internal/winners").set(key)).body.data.winners[0];

    const res = await request(app)
      .patch(`/internal/results/${winner.drawResultId}/payout`)
      .set(key)
      .send({ payoutStatus: "paid" });
    expect(res.status).toBe(200);
    expect(DrawResult.all().find((r) => String(r._id) === winner.drawResultId).payoutStatus).toBe("paid");
  });

  it("refuses to mirror a payout onto a non-winning entry", async () => {
    const id = await simulated();
    await request(app).post(`/admin/draws/${id}/publish`).set(auth(adminToken));
    const loser = DrawResult.all().find((r) => r.tier === null);
    const res = await request(app)
      .patch(`/internal/results/${loser._id}/payout`)
      .set(key)
      .send({ payoutStatus: "paid" });
    expect(res.status).toBe(404);
  });
});
