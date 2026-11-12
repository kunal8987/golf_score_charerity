process.env.LOG_LEVEL = "silent";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-at-least-thirty-two-characters";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_DONATION_WEBHOOK_SECRET = "whsec_donations_test";
process.env.CLIENT_URL = "https://digitalheroes.co.in";

jest.mock("stripe", () => {
  const instance = {
    checkout: { sessions: { create: jest.fn() } },
    webhooks: { constructEvent: jest.fn() },
  };
  return jest.fn(() => instance);
});
jest.mock("../src/models/Charity", () => require("./helpers/fakeCharityModel"));
jest.mock("../src/models/Donation", () => require("./helpers/fakeDonationModel"));

const request = require("supertest");
const Stripe = require("stripe");
const { notFound, errorHandler, signToken } = require("@dh/shared");
const Charity = require("./helpers/fakeCharityModel");
const Donation = require("./helpers/fakeDonationModel");
const { createApp } = require("../src/app");

const stripe = new Stripe();
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

const FUTURE = "2099-01-15T09:00:00Z";
const PAST = "2020-01-15T09:00:00Z";

beforeEach(() => {
  Charity.reset();
  Donation.reset();
  jest.clearAllMocks();
  stripe.checkout.sessions.create.mockResolvedValue({ id: "cs_test_1", url: "https://checkout.stripe.com/pay/cs_test_1" });
  stripe.webhooks.constructEvent.mockImplementation((body) => JSON.parse(body.toString()));
});

const seedCharity = (overrides = {}) =>
  Charity.seed({
    name: "Golf 4 Kids Trust",
    slug: "golf-4-kids-trust",
    description: "Helping children learn golf in local communities.",
    category: "children",
    ...overrides,
  });

describe("public directory", () => {
  it("lists only active charities", async () => {
    seedCharity();
    seedCharity({ name: "Old Charity", slug: "old", active: false });
    const res = await request(app).get("/");
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.charities[0].name).toBe("Golf 4 Kids Trust");
  });

  it("searches name and description, case-insensitively", async () => {
    seedCharity();
    seedCharity({ name: "Clean Rivers", slug: "clean-rivers", description: "Protecting waterways", category: "environment" });
    const byName = await request(app).get("/?q=GOLF");
    const byDescription = await request(app).get("/?q=waterways");
    expect(byName.body.data.total).toBe(1);
    expect(byDescription.body.data.charities[0].slug).toBe("clean-rivers");
  });

  it("treats search text literally (no regex injection)", async () => {
    seedCharity();
    const res = await request(app).get("/?q=.*");
    expect(res.body.data.total).toBe(0);
  });

  it("filters by category and rejects unknown categories", async () => {
    seedCharity();
    seedCharity({ name: "Clean Rivers", slug: "clean-rivers", category: "environment" });
    const res = await request(app).get("/?category=environment");
    expect(res.body.data.total).toBe(1);
    expect((await request(app).get("/?category=casino")).status).toBe(400);
  });

  it("shows featured charities first", async () => {
    seedCharity({ name: "Aardvark Aid", slug: "aardvark" });
    seedCharity({ name: "Zebra Fund", slug: "zebra", featured: true });
    const res = await request(app).get("/");
    expect(res.body.data.charities[0].slug).toBe("zebra");
  });
});

describe("homepage spotlight", () => {
  it("returns active featured charities only", async () => {
    seedCharity({ featured: true });
    seedCharity({ name: "Hidden", slug: "hidden", featured: true, active: false });
    seedCharity({ name: "Plain", slug: "plain", featured: false });
    const res = await request(app).get("/spotlight");
    expect(res.body.data.charities.map((c) => c.slug)).toEqual(["golf-4-kids-trust"]);
  });
});

describe("charity detail", () => {
  it("returns 404 for an inactive charity", async () => {
    const c = seedCharity({ active: false });
    const res = await request(app).get(`/${c.id ?? c._id}`);
    expect(res.status).toBe(404);
  });

  it("returns 400 for a malformed id", async () => {
    expect((await request(app).get("/not-an-id")).status).toBe(400);
  });

  it("shows only upcoming events, soonest first, with an IST time", async () => {
    const c = seedCharity({
      events: [
        { _id: "e1", title: "Past Day", date: new Date(PAST), location: "", description: "" },
        { _id: "e2", title: "Later Day", date: new Date("2099-03-01T09:00:00Z"), location: "", description: "" },
        { _id: "e3", title: "Next Day", date: new Date(FUTURE), location: "", description: "" },
      ],
    });
    const res = await request(app).get(`/${c._id}`);
    const titles = res.body.data.charity.upcomingEvents.map((e) => e.title);
    expect(titles).toEqual(["Next Day", "Later Day"]);
    expect(res.body.data.charity.upcomingEvents[0].dateIst).toBe("2099-01-15 14:30 IST");
  });
});

describe("admin charity management", () => {
  const newCharity = (overrides = {}) => ({
    name: "Golf 4 Kids Trust",
    description: "Helping children learn golf in local communities.",
    category: "children",
    ...overrides,
  });

  it("returns 401 without login and 403 for a subscriber", async () => {
    expect((await request(app).post("/admin/charities").send(newCharity())).status).toBe(401);
    expect((await request(app).post("/admin/charities").set(auth(userToken)).send(newCharity())).status).toBe(403);
  });

  it("creates a charity with a URL slug", async () => {
    const res = await request(app).post("/admin/charities").set(auth(adminToken)).send(newCharity());
    expect(res.status).toBe(201);
    expect(res.body.data.charity.slug).toBe("golf-4-kids-trust");
  });

  it("gives a unique slug when the name is already used", async () => {
    await request(app).post("/admin/charities").set(auth(adminToken)).send(newCharity());
    const res = await request(app).post("/admin/charities").set(auth(adminToken)).send(newCharity());
    expect(res.body.data.charity.slug).toBe("golf-4-kids-trust-2");
  });

  it("requires https URLs for website and images", async () => {
    const res = await request(app)
      .post("/admin/charities")
      .set(auth(adminToken))
      .send(newCharity({ website: "http://example.org" }));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/https/);
  });

  it("rejects unknown fields such as a client-chosen slug", async () => {
    const res = await request(app).post("/admin/charities").set(auth(adminToken)).send(newCharity({ slug: "custom" }));
    expect(res.status).toBe(400);
  });

  it("rejects an invalid category", async () => {
    const res = await request(app).post("/admin/charities").set(auth(adminToken)).send(newCharity({ category: "casino" }));
    expect(res.status).toBe(400);
  });

  it("updates a charity and returns 404 for a missing one", async () => {
    const c = seedCharity();
    const ok = await request(app).patch(`/admin/charities/${c._id}`).set(auth(adminToken)).send({ featured: true });
    expect(ok.body.data.charity.featured).toBe(true);
    const missing = await request(app)
      .patch("/admin/charities/5f0000000000000000000009")
      .set(auth(adminToken))
      .send({ featured: true });
    expect(missing.status).toBe(404);
  });

  it("deleting hides the charity from the public site but keeps the record", async () => {
    const c = seedCharity({ featured: true });
    await request(app).delete(`/admin/charities/${c._id}`).set(auth(adminToken));

    expect((await request(app).get(`/${c._id}`)).status).toBe(404);
    expect((await request(app).get("/")).body.data.total).toBe(0);
    expect(Charity.all()).toHaveLength(1);
    expect(Charity.all()[0].active).toBe(false);
  });

  it("adds a future event and rejects a past one", async () => {
    const c = seedCharity();
    const ok = await request(app)
      .post(`/admin/charities/${c._id}/events`)
      .set(auth(adminToken))
      .send({ title: "Charity Golf Day", date: FUTURE, location: "Nagpur" });
    expect(ok.status).toBe(201);

    const past = await request(app)
      .post(`/admin/charities/${c._id}/events`)
      .set(auth(adminToken))
      .send({ title: "Old Day", date: PAST });
    expect(past.status).toBe(400);
    expect(past.body.error.message).toMatch(/future/);
  });

  it("deletes an event", async () => {
    const c = seedCharity({
      events: [{ _id: "5f00000000000000000000e1", title: "Charity Golf Day", date: new Date(FUTURE), location: "", description: "" }],
    });
    const res = await request(app)
      .delete(`/admin/charities/${c._id}/events/5f00000000000000000000e1`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(Charity.all()[0].events).toHaveLength(0);
  });
});

describe("donations", () => {
  const seedActive = () => seedCharity();

  it("requires login", async () => {
    const c = seedActive();
    const res = await request(app).post("/donations").send({ charityId: c._id, amountInr: 500 });
    expect(res.status).toBe(401);
  });

  it.each([
    ["below the minimum", 50],
    ["a fraction of a rupee", 100.5],
    ["above the maximum", 200000],
  ])("rejects an amount %s", async (_label, amountInr) => {
    const c = seedActive();
    const res = await request(app).post("/donations").set(auth(userToken)).send({ charityId: c._id, amountInr });
    expect(res.status).toBe(400);
  });

  it("returns 404 for an inactive charity", async () => {
    const c = seedCharity({ active: false });
    const res = await request(app).post("/donations").set(auth(userToken)).send({ charityId: c._id, amountInr: 500 });
    expect(res.status).toBe(404);
  });

  it("creates a pending donation and a Stripe checkout in paise", async () => {
    const c = seedActive();
    const res = await request(app).post("/donations").set(auth(userToken)).send({ charityId: c._id, amountInr: 500 });

    expect(res.status).toBe(201);
    expect(res.body.data.url).toBe("https://checkout.stripe.com/pay/cs_test_1");
    const args = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(args.mode).toBe("payment");
    expect(args.line_items[0].price_data.unit_amount).toBe(50000);
    expect(args.metadata.type).toBe("donation");
    expect(args.metadata.donationId).toBe(res.body.data.donationId);

    const stored = Donation.all()[0];
    expect(stored.status).toBe("pending");
    expect(stored.stripeSessionId).toBe("cs_test_1");
    expect(stored.userId).toBe(USER);
  });

  it("marks the donation failed if Stripe cannot create the checkout", async () => {
    const c = seedActive();
    stripe.checkout.sessions.create.mockRejectedValue(new Error("Stripe is down"));
    const res = await request(app).post("/donations").set(auth(userToken)).send({ charityId: c._id, amountInr: 500 });

    expect(res.status).toBe(500);
    expect(Donation.all()[0].status).toBe("failed");
  });

  it("lists only the caller's own donations", async () => {
    const c = seedActive();
    Donation.seed({ userId: USER, charityId: c._id, amount: 50000, status: "completed" });
    Donation.seed({ userId: OTHER, charityId: c._id, amount: 10000, status: "completed" });
    const res = await request(app).get("/donations/me").set(auth(userToken));
    expect(res.body.data.donations).toHaveLength(1);
    expect(res.body.data.donations[0].amountInr).toBe(500);
  });
});

describe("donation webhook", () => {
  const send = (event) =>
    request(app)
      .post("/webhook")
      .set("stripe-signature", "good")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(event));

  const completedEvent = (donationId, overrides = {}) => ({
    type: "checkout.session.completed",
    data: { object: { metadata: { type: "donation", donationId }, payment_status: "paid", ...overrides } },
  });

  it("rejects an invalid Stripe signature", async () => {
    stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error("No signatures found");
    });
    const res = await request(app).post("/webhook").set("stripe-signature", "bad").set("Content-Type", "application/json").send("{}");
    expect(res.status).toBe(400);
  });

  it("completes a paid donation", async () => {
    const c = seedCharity();
    const d = Donation.seed({ userId: USER, charityId: c._id, amount: 50000, status: "pending" });
    await send(completedEvent(String(d._id)));
    expect(Donation.all()[0].status).toBe("completed");
    expect(Donation.all()[0].completedAt).toBeInstanceOf(Date);
  });

  it("is safe to receive the same event twice", async () => {
    const c = seedCharity();
    const d = Donation.seed({ userId: USER, charityId: c._id, amount: 50000, status: "pending" });
    await send(completedEvent(String(d._id)));
    const firstCompletedAt = Donation.all()[0].completedAt;
    await send(completedEvent(String(d._id)));
    expect(Donation.all()[0].status).toBe("completed");
    expect(Donation.all()[0].completedAt).toBe(firstCompletedAt);
  });

  it("does not complete a donation that is not paid yet", async () => {
    const c = seedCharity();
    const d = Donation.seed({ userId: USER, charityId: c._id, amount: 50000, status: "pending" });
    await send(completedEvent(String(d._id), { payment_status: "unpaid" }));
    expect(Donation.all()[0].status).toBe("pending");
  });

  it("marks an expired checkout as failed", async () => {
    const c = seedCharity();
    const d = Donation.seed({ userId: USER, charityId: c._id, amount: 50000, status: "pending" });
    await send({ type: "checkout.session.expired", data: { object: { metadata: { type: "donation", donationId: String(d._id) } } } });
    expect(Donation.all()[0].status).toBe("failed");
  });

  it("ignores sessions that are not donations", async () => {
    const c = seedCharity();
    const d = Donation.seed({ userId: USER, charityId: c._id, amount: 50000, status: "pending" });
    await send(completedEvent(String(d._id), { metadata: { type: "subscription" } }));
    expect(Donation.all()[0].status).toBe("pending");
  });
});

describe("admin donation report", () => {
  it("totals only completed donations, per charity, in rupees", async () => {
    const golf = seedCharity();
    const rivers = seedCharity({ name: "Clean Rivers", slug: "clean-rivers" });
    Donation.seed({ userId: USER, charityId: golf._id, amount: 50000, status: "completed" });
    Donation.seed({ userId: OTHER, charityId: golf._id, amount: 25000, status: "completed" });
    Donation.seed({ userId: USER, charityId: rivers._id, amount: 10000, status: "pending" });

    const res = await request(app).get("/admin/reports/donations").set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.totalInr).toBe(750);
    expect(res.body.data.perCharity).toEqual([
      expect.objectContaining({ name: "Golf 4 Kids Trust", totalInr: 750, donations: 2 }),
    ]);
  });

  it("is closed to subscribers", async () => {
    const res = await request(app).get("/admin/reports/donations").set(auth(userToken));
    expect(res.status).toBe(403);
  });
});
