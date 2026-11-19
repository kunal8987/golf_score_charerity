process.env.LOG_LEVEL = "silent";
process.env.JWT_SECRET = "test-secret-that-is-at-least-thirty-two-characters";
process.env.INTERNAL_API_KEY = "internal-test-key-0123456789abcdef";
process.env.GATEWAY_RATE_LIMIT_PER_MIN = "3";

const request = require("supertest");
const { notFound, errorHandler } = require("@dh/shared");
const { startUpstream } = require("./helpers/upstreams");
const { createApp } = require("../src/app");

let upstream;
beforeAll(async () => {
  upstream = await startUpstream("charities");
  process.env.CHARITY_SERVICE_URL = upstream.url;
});
afterAll(() => upstream.server.close());

describe("rate limiting", () => {
  it("returns 429 once a client exceeds the per-minute limit", async () => {
    const app = createApp();
    app.use(notFound);
    app.use(errorHandler);

    const statuses = [];
    for (let i = 0; i < 4; i += 1) {
      statuses.push((await request(app).get("/api/charities")).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it("never rate-limits Stripe webhooks", async () => {
    const app = createApp();
    app.use(notFound);
    app.use(errorHandler);
    const statuses = [];
    for (let i = 0; i < 5; i += 1) {
      statuses.push((await request(app).post("/api/charities/webhook").send({})).status);
    }
    expect(statuses.every((s) => s !== 429)).toBe(true);
  });
});
