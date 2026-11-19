process.env.LOG_LEVEL = "silent";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-at-least-thirty-two-characters";
process.env.INTERNAL_API_KEY = "internal-test-key-0123456789abcdef";
process.env.GATEWAY_RATE_LIMIT_PER_MIN = "100000";
process.env.PROXY_TIMEOUT_MS = "250";
process.env.SUBSCRIPTION_CACHE_TTL_MS = "60000";

const request = require("supertest");
const { notFound, errorHandler, signToken } = require("@dh/shared");
const { startUpstream } = require("./helpers/upstreams");
const { createApp } = require("../src/app");
const { clearSubscriptionCache } = require("../src/services/subscriptionCache");

const USER = "5f0000000000000000000001";
const OTHER = "5f0000000000000000000002";
const ADMIN = "5f0000000000000000000009";
const subscriberToken = signToken({ _id: USER, role: "subscriber" });
const adminToken = signToken({ _id: ADMIN, role: "admin" });
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

const subs = { active: new Set([USER]), calls: 0, down: false };
let upstreams;
let app;

beforeAll(async () => {
  upstreams = {
    auth: await startUpstream("auth", { slowMs: 800 }),
    subscriptions: await startUpstream("subscriptions", subs),
    scores: await startUpstream("scores"),
    charities: await startUpstream("charities"),
    draws: await startUpstream("draws"),
    winners: await startUpstream("winners"),
  };
  process.env.AUTH_SERVICE_URL = upstreams.auth.url;
  process.env.SUBSCRIPTION_SERVICE_URL = upstreams.subscriptions.url;
  process.env.SCORE_SERVICE_URL = upstreams.scores.url;
  process.env.CHARITY_SERVICE_URL = upstreams.charities.url;
  process.env.DRAW_SERVICE_URL = upstreams.draws.url;
  process.env.WINNER_SERVICE_URL = upstreams.winners.url;

  app = createApp();
  app.use(notFound);
  app.use(errorHandler);
});

afterAll(() => {
  for (const u of Object.values(upstreams)) u.server.close();
});

beforeEach(() => {
  clearSubscriptionCache();
  subs.calls = 0;
  subs.down = false;
});

describe("public and protected routes", () => {
  it("lets anyone read the charity directory, with no identity headers", async () => {
    const res = await request(app).get("/api/charities");
    expect(res.status).toBe(200);
    expect(res.body.service).toBe("charities");
    expect(res.body.path).toBe("/");
    expect(res.body.headers["x-user-id"]).toBeUndefined();
  });

  it("lets anyone open a charity profile and the spotlight", async () => {
    expect((await request(app).get("/api/charities/spotlight")).status).toBe(200);
    expect((await request(app).get("/api/charities/5f00000000000000000000c1")).status).toBe(200);
  });

  it("requires login for a user's own donation history", async () => {
    expect((await request(app).get("/api/charities/donations/me")).status).toBe(401);
  });

  it("requires login for the profile endpoint", async () => {
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
  });

  it("lets anyone sign up, log in and log out", async () => {
    expect((await request(app).post("/api/auth/signup").send({})).status).toBe(200);
    expect((await request(app).post("/api/auth/login").send({})).status).toBe(200);
    expect((await request(app).post("/api/auth/logout")).status).toBe(200);
  });

  it("lets Stripe reach the webhooks without a login", async () => {
    expect((await request(app).post("/api/subscriptions/webhook").send({})).status).toBe(200);
    expect((await request(app).post("/api/charities/webhook").send({})).status).toBe(200);
  });

  it("forwards the path with the /api prefix removed", async () => {
    const res = await request(app).get("/api/auth/me").set(bearer(subscriberToken));
    expect(res.body.path).toBe("/me");
  });

  it("returns 404 for a service that does not exist", async () => {
    const res = await request(app).get("/api/nope/anything");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe("identity", () => {
  it("forwards the verified user id and role to the service", async () => {
    const res = await request(app).get("/api/auth/me").set(bearer(subscriberToken));
    expect(res.body.headers["x-user-id"]).toBe(USER);
    expect(res.body.headers["x-user-role"]).toBe("subscriber");
  });

  it("accepts the login cookie as well as a Bearer token", async () => {
    const res = await request(app).get("/api/auth/me").set("Cookie", `dh_token=${subscriberToken}`);
    expect(res.status).toBe(200);
    expect(res.body.headers["x-user-id"]).toBe(USER);
  });

  it("rejects a tampered token", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer not.a.token");
    expect(res.status).toBe(401);
  });

  it("rejects an expired token", async () => {
    const expired = signToken({ _id: USER, role: "subscriber" });
    const jwt = require("jsonwebtoken");
    const old = jwt.sign({ sub: USER, role: "subscriber", exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET);
    expect(expired).toBeTruthy();
    const res = await request(app).get("/api/auth/me").set(bearer(old));
    expect(res.status).toBe(401);
  });
});

describe("spoofed headers are removed", () => {
  it("drops an identity header sent by an anonymous caller", async () => {
    const res = await request(app).get("/api/charities").set("x-user-role", "admin").set("x-user-id", "x");
    expect(res.body.headers["x-user-role"]).toBeUndefined();
    expect(res.body.headers["x-user-id"]).toBeUndefined();
  });

  it("replaces a forged role with the verified one", async () => {
    const res = await request(app).get("/api/auth/me").set(bearer(subscriberToken)).set("x-user-role", "admin");
    expect(res.body.headers["x-user-role"]).toBe("subscriber");
  });

  it("drops the internal key a client tries to send", async () => {
    const res = await request(app).get("/api/charities").set("x-internal-key", "guessed");
    expect(res.body.headers["x-internal-key"]).toBeUndefined();
  });

  it("keeps a valid request id, and replaces an invalid one", async () => {
    const kept = await request(app).get("/api/charities").set("x-request-id", "abc-123-def-456");
    expect(kept.body.headers["x-request-id"]).toBe("abc-123-def-456");
    expect(kept.headers["x-request-id"]).toBe("abc-123-def-456");

    const replaced = await request(app).get("/api/charities").set("x-request-id", "bad id!!");
    expect(replaced.body.headers["x-request-id"]).not.toBe("bad id!!");
    expect(replaced.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("admin routes", () => {
  it("refuses a subscriber on an admin route", async () => {
    const res = await request(app).get("/api/charities/admin/charities").set(bearer(subscriberToken));
    expect(res.status).toBe(403);
  });

  it("forwards an admin's request on an admin route", async () => {
    const res = await request(app).get("/api/charities/admin/charities").set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.path).toBe("/admin/charities");
  });

  it("refuses a subscriber on the user list", async () => {
    expect((await request(app).get("/api/auth/users").set(bearer(subscriberToken))).status).toBe(403);
  });

  it("refuses a subscriber on the winners admin list", async () => {
    expect((await request(app).get("/api/winners/admin/winners").set(bearer(subscriberToken))).status).toBe(403);
  });
});

describe("subscriber routes", () => {
  it("requires login for score entry", async () => {
    expect((await request(app).get("/api/scores/scores")).status).toBe(401);
  });

  it("refuses a logged-in user without an active subscription", async () => {
    const other = signToken({ _id: OTHER, role: "subscriber" });
    const res = await request(app).get("/api/scores/scores").set(bearer(other));
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/active subscription/);
  });

  it("forwards score entry for an active subscriber", async () => {
    const res = await request(app).get("/api/scores/scores").set(bearer(subscriberToken));
    expect(res.status).toBe(200);
    expect(res.body.service).toBe("scores");
  });

  it("asks the subscription service once, then uses the cache", async () => {
    await request(app).get("/api/scores/scores").set(bearer(subscriberToken));
    await request(app).get("/api/scores/scores").set(bearer(subscriberToken));
    await request(app).post("/api/scores/scores").set(bearer(subscriberToken)).send({});
    expect(subs.calls).toBe(1);
  });

  it("fails closed when the subscription service is down, and does not forward", async () => {
    subs.down = true;
    const res = await request(app).get("/api/scores/scores").set(bearer(subscriberToken));
    expect(res.status).toBe(503);
    expect(res.body.error.message).toMatch(/could not confirm/);
  });

  it("lets an admin use the score admin route without a subscription", async () => {
    const res = await request(app).get("/api/scores/admin/scores").set(bearer(adminToken));
    expect(res.status).toBe(200);
  });
});

describe("internal endpoints", () => {
  it("never forwards internal paths, even to an admin", async () => {
    const res = await request(app).get("/api/subscriptions/internal/access/abc").set(bearer(adminToken));
    expect(res.status).toBe(404);
  });
});

describe("request size limits", () => {
  it("refuses a 2 MB signup body before forwarding it", async () => {
    const big = Buffer.alloc(2 * 1024 * 1024, "a");
    const res = await request(app)
      .post("/api/auth/signup")
      .set("Content-Type", "application/json")
      .send(big);
    expect(res.status).toBe(413);
  });

  it("allows a 2 MB proof upload", async () => {
    const big = Buffer.alloc(2 * 1024 * 1024, "a");
    const res = await request(app)
      .post("/api/winners/winners/5f00000000000000000000a1/proof")
      .set(bearer(subscriberToken))
      .set("Content-Type", "application/octet-stream")
      .send(big);
    expect(res.status).toBe(200);
    expect(res.body.bodyBytes).toBe(big.length);
  });

  it("refuses a 7 MB proof upload", async () => {
    const big = Buffer.alloc(7 * 1024 * 1024, "a");
    const res = await request(app)
      .post("/api/winners/winners/5f00000000000000000000a1/proof")
      .set(bearer(subscriberToken))
      .set("Content-Type", "application/octet-stream")
      .send(big);
    expect(res.status).toBe(413);
  });
});

describe("failures", () => {
  it("returns 502 when a service drops the connection", async () => {
    const res = await request(app).get("/api/draws/crash").set(bearer(subscriberToken));
    expect(res.status).toBe(502);
    expect(res.body.error.message).toBe("Service unavailable");
  });

  it("returns 504 when a service is too slow", async () => {
    const res = await request(app).get("/api/auth/slow").set(bearer(subscriberToken));
    expect(res.status).toBe(504);
    expect(res.body.error.message).toMatch(/too long/);
  });
});

describe("ops status", () => {
  it("needs the internal key", async () => {
    expect((await request(app).get("/ops/services")).status).toBe(403);
  });

  it("reports every service as up", async () => {
    const res = await request(app).get("/ops/services").set("x-internal-key", process.env.INTERNAL_API_KEY);
    expect(res.status).toBe(200);
    const names = res.body.data.services.map((s) => s.service).sort();
    expect(names).toEqual(["auth", "charities", "draws", "scores", "subscriptions", "winners"]);
    expect(res.body.data.services.every((s) => s.status === "up")).toBe(true);
  });

  it("the gateway answers its own health check", async () => {
    const res = await request(app).get("/health");
    expect(res.body.data.service).toBe("gateway");
  });
});
