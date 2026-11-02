process.env.LOG_LEVEL = "silent";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-at-least-thirty-two-characters";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_PRICE_MONTHLY = "price_monthly";
process.env.STRIPE_PRICE_YEARLY = "price_yearly";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
process.env.INTERNAL_API_KEY = "internal-test-key-0123456789abcdef";

jest.mock("stripe", () => {
  const instance = {
    customers: { create: jest.fn() },
    checkout: { sessions: { create: jest.fn() } },
    subscriptions: { retrieve: jest.fn(), update: jest.fn() },
    webhooks: { constructEvent: jest.fn() },
  };
  return jest.fn(() => instance);
});
jest.mock("../src/models/Subscription", () => require("./helpers/fakeSubscriptionModel"));

const request = require("supertest");
const Stripe = require("stripe");
const { notFound, errorHandler, signToken } = require("@dh/shared");
const Subscription = require("./helpers/fakeSubscriptionModel");
const { createApp } = require("../src/app");
const { mapStatus } = require("../src/services/stripe");

const stripe = new Stripe();
const app = createApp();
app.use(notFound);
app.use(errorHandler);

const USER = "5f0000000000000000000001";
const ADMIN = "5f0000000000000000000002";
const userToken = signToken({ _id: USER, role: "subscriber" });
const adminToken = signToken({ _id: ADMIN, role: "admin" });
const auth = (token) => ({ Authorization: `Bearer ${token}` });

// Shape of a Stripe subscription object (only the fields we read)
function stripeSub({ status = "active", cancel = false, priceId = "price_monthly", userId = USER } = {}) {
  return {
    id: "sub_123",
    customer: "cus_123",
    status,
    cancel_at_period_end: cancel,
    current_period_end: 1900000000,
    metadata: { userId },
    items: { data: [{ price: { id: priceId } }] },
  };
}

beforeEach(() => {
  Subscription.reset();
  jest.clearAllMocks();
  stripe.webhooks.constructEvent.mockImplementation((body) => JSON.parse(body.toString()));
});

describe("status mapping", () => {
  it.each([
    ["active", "active"],
    ["trialing", "active"],
    ["past_due", "lapsed"],
    ["unpaid", "lapsed"],
    ["canceled", "cancelled"],
    ["incomplete", "inactive"],
    ["incomplete_expired", "inactive"],
  ])("maps Stripe %s to %s", (stripeStatus, expected) => {
    expect(mapStatus(stripeStatus)).toBe(expected);
  });
});

describe("POST /checkout", () => {
  it("requires login", async () => {
    const res = await request(app).post("/checkout").send({ plan: "monthly" });
    expect(res.status).toBe(401);
  });

  it("rejects an unknown plan", async () => {
    const res = await request(app).post("/checkout").set(auth(userToken)).send({ plan: "weekly" });
    expect(res.status).toBe(400);
  });

  it("creates a Stripe customer and returns a Checkout URL", async () => {
    stripe.customers.create.mockResolvedValue({ id: "cus_new" });
    stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/test" });

    const res = await request(app).post("/checkout").set(auth(userToken)).send({ plan: "yearly" });

    expect(res.status).toBe(201);
    expect(res.body.data.url).toBe("https://checkout.stripe.com/c/pay/test");
    expect(stripe.customers.create).toHaveBeenCalledWith({ metadata: { userId: USER } });
    const args = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(args.mode).toBe("subscription");
    expect(args.line_items[0].price).toBe("price_yearly");
    expect(args.client_reference_id).toBe(USER);
    expect(args.subscription_data.metadata.userId).toBe(USER);
    expect(Subscription.byUser(USER).stripeCustomerId).toBe("cus_new");
  });

  it("reuses an existing Stripe customer", async () => {
    Subscription.seed({ userId: USER, stripeCustomerId: "cus_existing", status: "cancelled" });
    stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/x" });

    await request(app).post("/checkout").set(auth(userToken)).send({ plan: "monthly" });

    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create.mock.calls[0][0].customer).toBe("cus_existing");
  });

  it("blocks a second subscription when one is already active", async () => {
    Subscription.seed({ userId: USER, status: "active", plan: "monthly" });
    const res = await request(app).post("/checkout").set(auth(userToken)).send({ plan: "monthly" });
    expect(res.status).toBe(409);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});

describe("GET /status", () => {
  it("returns inactive for a user who never subscribed", async () => {
    const res = await request(app).get("/status").set(auth(userToken));
    expect(res.status).toBe(200);
    expect(res.body.data.subscription.status).toBe("inactive");
  });

  it("returns the plan and renewal date for an active user", async () => {
    Subscription.seed({ userId: USER, status: "active", plan: "monthly", currentPeriodEnd: new Date(1900000000000) });
    const res = await request(app).get("/status").set(auth(userToken));
    expect(res.body.data.subscription.status).toBe("active");
    expect(res.body.data.subscription.plan).toBe("monthly");
  });
});

describe("POST /webhook", () => {
  it("rejects a request with an invalid Stripe signature", async () => {
    stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error("No signatures found");
    });
    const res = await request(app)
      .post("/webhook")
      .set("stripe-signature", "bad")
      .set("Content-Type", "application/json")
      .send("{}");
    expect(res.status).toBe(400);
  });

  it("activates the subscription when Stripe reports it active", async () => {
    stripe.subscriptions.retrieve.mockResolvedValue(stripeSub({ status: "active" }));
    const event = { type: "customer.subscription.updated", data: { object: { id: "sub_123" } } };

    const res = await request(app)
      .post("/webhook")
      .set("stripe-signature", "good")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(event));

    expect(res.status).toBe(200);
    const sub = Subscription.byUser(USER);
    expect(sub.status).toBe("active");
    expect(sub.plan).toBe("monthly");
    expect(sub.stripeSubscriptionId).toBe("sub_123");
    expect(sub.currentPeriodEnd).toEqual(new Date(1900000000000));
  });

  it("marks the subscription cancelled when Stripe reports it deleted", async () => {
    Subscription.seed({ userId: USER, status: "active", plan: "monthly", stripeSubscriptionId: "sub_123" });
    stripe.subscriptions.retrieve.mockResolvedValue(stripeSub({ status: "canceled" }));
    const event = { type: "customer.subscription.deleted", data: { object: { id: "sub_123" } } };

    await request(app)
      .post("/webhook")
      .set("stripe-signature", "good")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(event));

    expect(Subscription.byUser(USER).status).toBe("cancelled");
  });

  it("marks the subscription lapsed when a payment fails (past_due)", async () => {
    Subscription.seed({ userId: USER, status: "active", plan: "monthly", stripeSubscriptionId: "sub_123" });
    stripe.subscriptions.retrieve.mockResolvedValue(stripeSub({ status: "past_due" }));
    const event = { type: "customer.subscription.updated", data: { object: { id: "sub_123" } } };

    await request(app)
      .post("/webhook")
      .set("stripe-signature", "good")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(event));

    expect(Subscription.byUser(USER).status).toBe("lapsed");
  });

  it("syncs from checkout.session.completed", async () => {
    stripe.subscriptions.retrieve.mockResolvedValue(stripeSub({ status: "active", priceId: "price_yearly" }));
    const event = {
      type: "checkout.session.completed",
      data: { object: { mode: "subscription", subscription: "sub_123" } },
    };

    await request(app)
      .post("/webhook")
      .set("stripe-signature", "good")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(event));

    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_123");
    expect(Subscription.byUser(USER).plan).toBe("yearly");
  });

  it("ignores events it does not handle", async () => {
    const event = { type: "invoice.created", data: { object: {} } };
    const res = await request(app)
      .post("/webhook")
      .set("stripe-signature", "good")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(event));
    expect(res.status).toBe(200);
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });
});

describe("POST /cancel and /resume", () => {
  it("cancels at period end, not immediately", async () => {
    Subscription.seed({ userId: USER, status: "active", plan: "monthly", stripeSubscriptionId: "sub_123" });
    stripe.subscriptions.update.mockResolvedValue(stripeSub({ status: "active", cancel: true }));

    const res = await request(app).post("/cancel").set(auth(userToken));

    expect(res.status).toBe(200);
    expect(stripe.subscriptions.update).toHaveBeenCalledWith("sub_123", { cancel_at_period_end: true });
    expect(res.body.data.subscription.cancelAtPeriodEnd).toBe(true);
    expect(res.body.data.subscription.status).toBe("active"); // still has access until period end
  });

  it("refuses to cancel when there is no active subscription", async () => {
    const res = await request(app).post("/cancel").set(auth(userToken));
    expect(res.status).toBe(400);
  });

  it("undoes a pending cancellation", async () => {
    Subscription.seed({ userId: USER, status: "active", plan: "monthly", stripeSubscriptionId: "sub_123", cancelAtPeriodEnd: true });
    stripe.subscriptions.update.mockResolvedValue(stripeSub({ status: "active", cancel: false }));

    const res = await request(app).post("/resume").set(auth(userToken));

    expect(stripe.subscriptions.update).toHaveBeenCalledWith("sub_123", { cancel_at_period_end: false });
    expect(res.body.data.subscription.cancelAtPeriodEnd).toBe(false);
  });
});

describe("GET /internal/access/:userId", () => {
  it("rejects calls without the internal key", async () => {
    const res = await request(app).get(`/internal/access/${USER}`);
    expect(res.status).toBe(403);
  });

  it("rejects a wrong internal key", async () => {
    const res = await request(app).get(`/internal/access/${USER}`).set("x-internal-key", "wrong");
    expect(res.status).toBe(403);
  });

  it("tells the caller whether the user has an active subscription", async () => {
    Subscription.seed({ userId: USER, status: "active", plan: "monthly" });
    const res = await request(app)
      .get(`/internal/access/${USER}`)
      .set("x-internal-key", process.env.INTERNAL_API_KEY);
    expect(res.status).toBe(200);
    expect(res.body.data.hasAccess).toBe(true);
  });
});

describe("admin routes", () => {
  it("returns 403 to a subscriber", async () => {
    const res = await request(app).get("/admin/subscriptions").set(auth(userToken));
    expect(res.status).toBe(403);
  });

  it("lets an admin list subscriptions filtered by status", async () => {
    Subscription.seed({ userId: "a".repeat(24), status: "active" });
    Subscription.seed({ userId: "b".repeat(24), status: "lapsed" });

    const res = await request(app).get("/admin/subscriptions?status=lapsed").set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.subscriptions[0].status).toBe("lapsed");
  });
});
