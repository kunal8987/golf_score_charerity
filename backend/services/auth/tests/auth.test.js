process.env.LOG_LEVEL = "silent";
process.env.JWT_SECRET = "test-secret-that-is-at-least-thirty-two-characters";
process.env.NODE_ENV = "test";

jest.mock("../src/models/User", () => require("./helpers/fakeUserModel"));

const request = require("supertest");
const cookieParser = require("cookie-parser");
const { createService, notFound, errorHandler, signToken } = require("@dh/shared");
const User = require("./helpers/fakeUserModel");

function buildApp() {
  const app = createService("auth-service-test");
  app.set("trust proxy", 1);
  app.use(cookieParser());
  app.use(require("../src/routes"));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const PASSWORD = "Passw0rd123";
const validSignup = { name: "Ada Lovelace", email: "ada@example.com", password: PASSWORD };

beforeEach(() => User.reset());

async function signupAndGetCookie(body = validSignup) {
  const res = await request(app).post("/signup").send(body);
  return res.headers["set-cookie"][0].split(";")[0];
}

describe("POST /signup", () => {
  it("creates a subscriber, sets an httpOnly cookie, and hides secrets", async () => {
    const res = await request(app).post("/signup").send(validSignup);

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe("ada@example.com");
    expect(res.body.data.user.role).toBe("subscriber");
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.password).toBeUndefined();

    const cookie = res.headers["set-cookie"][0];
    expect(cookie).toMatch(/^dh_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it("normalises the email to lowercase", async () => {
    const res = await request(app).post("/signup").send({ ...validSignup, email: "  ADA@Example.COM " });
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe("ada@example.com");
  });

  it("rejects a role field so users cannot make themselves admin", async () => {
    const res = await request(app).post("/signup").send({ ...validSignup, role: "admin" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("rejects a weak password", async () => {
    const res = await request(app).post("/signup").send({ ...validSignup, password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/at least 8/);
  });

  it("rejects a password with no number", async () => {
    const res = await request(app).post("/signup").send({ ...validSignup, password: "NoNumbersHere" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/number/);
  });

  it("rejects a charity percentage below the 10% minimum", async () => {
    const res = await request(app).post("/signup").send({ ...validSignup, charityPercentage: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Minimum charity contribution is 10%/);
  });

  it("returns 409 for a duplicate email", async () => {
    await request(app).post("/signup").send(validSignup);
    const res = await request(app).post("/signup").send(validSignup);
    expect(res.status).toBe(409);
  });
});

describe("POST /login", () => {
  beforeEach(() => User.seed({ name: "Ada Lovelace", email: "ada@example.com", password: PASSWORD }));

  it("logs in with the correct password and sets the cookie", async () => {
    const res = await request(app).post("/login").send({ email: "ada@example.com", password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"][0]).toMatch(/^dh_token=/);
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it("gives the same error for a wrong password and an unknown email", async () => {
    const wrong = await request(app).post("/login").send({ email: "ada@example.com", password: "WrongPass1" });
    const unknown = await request(app).post("/login").send({ email: "nobody@example.com", password: PASSWORD });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe("Invalid email or password");
    expect(unknown.body.error.message).toBe("Invalid email or password");
  });
});

describe("GET /me and PATCH /me", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).get("/me");
    expect(res.status).toBe(401);
  });

  it("returns the profile with a valid cookie", async () => {
    const cookie = await signupAndGetCookie();
    const res = await request(app).get("/me").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe("ada@example.com");
  });

  it("accepts a Bearer token as well as the cookie", async () => {
    const user = User.seed({ name: "Ada Lovelace", email: "bearer@example.com", password: PASSWORD });
    const token = signToken(user);
    const res = await request(app).get("/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("returns 401 for a tampered token", async () => {
    const res = await request(app).get("/me").set("Authorization", "Bearer not.a.real.token");
    expect(res.status).toBe(401);
  });

  it("updates name and charity choice", async () => {
    const cookie = await signupAndGetCookie();
    const res = await request(app)
      .patch("/me")
      .set("Cookie", cookie)
      .send({ name: "Ada King", charityPercentage: 25 });
    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe("Ada King");
    expect(res.body.data.user.charity.percentage).toBe(25);
  });

  it("cannot change the role through PATCH /me", async () => {
    const cookie = await signupAndGetCookie();
    const res = await request(app).patch("/me").set("Cookie", cookie).send({ role: "admin" });
    expect(res.status).toBe(400);
  });

  it("rejects an empty update", async () => {
    const cookie = await signupAndGetCookie();
    const res = await request(app).patch("/me").set("Cookie", cookie).send({});
    expect(res.status).toBe(400);
  });
});

describe("admin routes", () => {
  it("returns 403 to a subscriber", async () => {
    const cookie = await signupAndGetCookie();
    const res = await request(app).get("/users").set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  it("lets an admin list users with pagination", async () => {
    const admin = User.seed({ name: "Admin User", email: "admin@example.com", password: PASSWORD, role: "admin" });
    User.seed({ name: "Sub One", email: "one@example.com", password: PASSWORD });
    const token = signToken(admin);

    const res = await request(app).get("/users?page=1&limit=10").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.users).toHaveLength(2);
  });

  it("lets an admin change another user's role", async () => {
    const admin = User.seed({ name: "Admin User", email: "admin@example.com", password: PASSWORD, role: "admin" });
    const sub = User.seed({ name: "Sub One", email: "one@example.com", password: PASSWORD });
    const token = signToken(admin);

    const res = await request(app)
      .patch(`/users/${sub._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "admin" });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe("admin");
  });

  it("stops an admin from removing their own admin role", async () => {
    const admin = User.seed({ name: "Admin User", email: "admin@example.com", password: PASSWORD, role: "admin" });
    const token = signToken(admin);

    const res = await request(app)
      .patch(`/users/${admin._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "subscriber" });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid user id", async () => {
    const admin = User.seed({ name: "Admin User", email: "admin@example.com", password: PASSWORD, role: "admin" });
    const token = signToken(admin);
    const res = await request(app)
      .patch("/users/not-an-id")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "X Y" });
    expect(res.status).toBe(400);
  });
});

describe("POST /logout", () => {
  it("clears the session cookie", async () => {
    const res = await request(app).post("/logout");
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"][0]).toMatch(/^dh_token=;/);
  });
});
