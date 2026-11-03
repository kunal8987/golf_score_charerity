process.env.LOG_LEVEL = "silent";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-at-least-thirty-two-characters";

jest.mock("../src/models/Score", () => require("./helpers/fakeScoreModel"));
jest.mock("../src/services/subscriptionClient", () => ({ hasActiveSubscription: jest.fn() }));

const request = require("supertest");
const { notFound, errorHandler, signToken } = require("@dh/shared");
const Score = require("./helpers/fakeScoreModel");
const { hasActiveSubscription } = require("../src/services/subscriptionClient");
const { createApp } = require("../src/app");

const app = createApp();
app.use(notFound);
app.use(errorHandler);

const USER = "5f0000000000000000000001";
const OTHER = "5f0000000000000000000002";
const ADMIN = "5f0000000000000000000003";
const userToken = signToken({ _id: USER, role: "subscriber" });
const otherToken = signToken({ _id: OTHER, role: "subscriber" });
const adminToken = signToken({ _id: ADMIN, role: "admin" });
const auth = (token) => ({ Authorization: `Bearer ${token}` });

// Dates are in the past so they are never rejected as "future"
const addScore = (token, score, playedOn) =>
  request(app).post("/scores").set(auth(token)).send({ score, playedOn });

beforeEach(() => {
  Score.reset();
  jest.clearAllMocks();
  hasActiveSubscription.mockResolvedValue(true);
});

describe("access rules", () => {
  it("requires login", async () => {
    const res = await request(app).get("/scores");
    expect(res.status).toBe(401);
  });

  it("requires an active subscription", async () => {
    hasActiveSubscription.mockResolvedValue(false);
    const res = await addScore(userToken, 30, "2024-03-01");
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/active subscription/);
    expect(Score.all()).toHaveLength(0);
  });

  it("fails closed when the subscription service is unreachable", async () => {
    hasActiveSubscription.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await addScore(userToken, 30, "2024-03-01");
    expect(res.status).toBe(503);
    expect(res.body.error.message).toMatch(/could not confirm your subscription/);
  });
});

describe("POST /scores validation", () => {
  it.each([
    ["zero", 0],
    ["above 45", 46],
    ["decimal", 12.5],
    ["text", "abc"],
  ])("rejects a score that is %s", async (_label, value) => {
    const res = await addScore(userToken, value, "2024-03-01");
    expect(res.status).toBe(400);
  });

  it("rejects a future date", async () => {
    const res = await addScore(userToken, 30, "2099-01-01");
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/future/);
  });

  it("rejects an impossible calendar date", async () => {
    const res = await addScore(userToken, 30, "2024-02-31");
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/not a valid calendar date/);
  });

  it("rejects a non ISO date format", async () => {
    const res = await addScore(userToken, 30, "03/01/2024");
    expect(res.status).toBe(400);
  });

  it("rejects unknown fields", async () => {
    const res = await request(app)
      .post("/scores")
      .set(auth(userToken))
      .send({ score: 30, playedOn: "2024-03-01", userId: OTHER });
    expect(res.status).toBe(400);
  });

  it("accepts the boundary scores 1 and 45", async () => {
    expect((await addScore(userToken, 1, "2024-03-01")).status).toBe(201);
    expect((await addScore(userToken, 45, "2024-03-02")).status).toBe(201);
  });
});

describe("one score per date", () => {
  it("rejects a second score for the same date with 409", async () => {
    await addScore(userToken, 30, "2024-03-01");
    const res = await addScore(userToken, 25, "2024-03-01");
    expect(res.status).toBe(409);
    expect(Score.all()).toHaveLength(1);
  });

  it("allows another user to score on the same date", async () => {
    await addScore(userToken, 30, "2024-03-01");
    const res = await addScore(otherToken, 25, "2024-03-01");
    expect(res.status).toBe(201);
  });
});

describe("rolling window of the latest 5 scores", () => {
  it("keeps only 5 scores and removes the oldest when a 6th is added", async () => {
    const dates = ["2024-03-01", "2024-03-02", "2024-03-03", "2024-03-04", "2024-03-05", "2024-03-06"];
    for (const [i, d] of dates.entries()) await addScore(userToken, 20 + i, d);

    const stored = Score.all().map((s) => s.playedOn.toISOString().slice(0, 10)).sort();
    expect(stored).toEqual(["2024-03-02", "2024-03-03", "2024-03-04", "2024-03-05", "2024-03-06"]);
  });

  it("returns scores newest first", async () => {
    await addScore(userToken, 30, "2024-03-01");
    await addScore(userToken, 31, "2024-03-05");
    await addScore(userToken, 32, "2024-03-03");

    const res = await request(app).get("/scores").set(auth(userToken));
    expect(res.body.data.scores.map((s) => s.playedOn)).toEqual(["2024-03-05", "2024-03-03", "2024-03-01"]);
    expect(res.body.data.max).toBe(5);
  });

  it("refuses a score older than all 5 kept scores, and leaves the 5 unchanged", async () => {
    for (const d of ["2024-03-02", "2024-03-03", "2024-03-04", "2024-03-05", "2024-03-06"]) {
      await addScore(userToken, 30, d);
    }
    const res = await addScore(userToken, 40, "2024-03-01");

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/older than your 5 most recent/);
    expect(Score.all()).toHaveLength(5);
    expect(Score.all().some((s) => s.playedOn.toISOString().startsWith("2024-03-01"))).toBe(false);
  });

  it("accepts an older date while fewer than 5 scores are stored", async () => {
    await addScore(userToken, 30, "2024-03-05");
    const res = await addScore(userToken, 40, "2024-03-01");
    expect(res.status).toBe(201);
    expect(Score.all()).toHaveLength(2);
  });

  it("never touches another user's scores when pruning", async () => {
    for (const d of ["2024-03-01", "2024-03-02", "2024-03-03", "2024-03-04", "2024-03-05"]) {
      await addScore(otherToken, 25, d);
    }
    for (const d of ["2024-03-06", "2024-03-07", "2024-03-08"]) {
      await addScore(userToken, 30, d);
    }
    const otherCount = Score.all().filter((s) => s.userId === OTHER).length;
    expect(otherCount).toBe(5);
  });
});

describe("PUT and DELETE", () => {
  it("edits the score value", async () => {
    const created = await addScore(userToken, 30, "2024-03-01");
    const res = await request(app)
      .put(`/scores/${created.body.data.score.id}`)
      .set(auth(userToken))
      .send({ score: 38 });
    expect(res.status).toBe(200);
    expect(res.body.data.score.score).toBe(38);
  });

  it("rejects moving a score onto a date that is already used", async () => {
    await addScore(userToken, 30, "2024-03-01");
    const second = await addScore(userToken, 31, "2024-03-02");
    const res = await request(app)
      .put(`/scores/${second.body.data.score.id}`)
      .set(auth(userToken))
      .send({ playedOn: "2024-03-01" });
    expect(res.status).toBe(409);
  });

  it("cannot edit another user's score (404, not 403, to hide that it exists)", async () => {
    const created = await addScore(otherToken, 30, "2024-03-01");
    const res = await request(app)
      .put(`/scores/${created.body.data.score.id}`)
      .set(auth(userToken))
      .send({ score: 10 });
    expect(res.status).toBe(404);
  });

  it("deletes the user's own score", async () => {
    const created = await addScore(userToken, 30, "2024-03-01");
    const res = await request(app).delete(`/scores/${created.body.data.score.id}`).set(auth(userToken));
    expect(res.status).toBe(200);
    expect(Score.all()).toHaveLength(0);
  });

  it("returns 400 for a malformed score id", async () => {
    const res = await request(app).delete("/scores/not-an-id").set(auth(userToken));
    expect(res.status).toBe(400);
  });
});

describe("admin routes", () => {
  it("returns 403 to a subscriber", async () => {
    const res = await request(app).get("/admin/scores").set(auth(userToken));
    expect(res.status).toBe(403);
  });

  it("lets an admin view one user's scores", async () => {
    await addScore(userToken, 30, "2024-03-01");
    await addScore(otherToken, 25, "2024-03-01");
    const res = await request(app).get(`/admin/scores?userId=${USER}`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.scores).toHaveLength(1);
  });

  it("lets an admin correct another user's score", async () => {
    const created = await addScore(userToken, 30, "2024-03-01");
    const res = await request(app)
      .patch(`/admin/scores/${created.body.data.score.id}`)
      .set(auth(adminToken))
      .send({ score: 41 });
    expect(res.status).toBe(200);
    expect(res.body.data.score.score).toBe(41);
  });
});
