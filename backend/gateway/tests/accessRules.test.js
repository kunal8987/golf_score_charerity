const { resolveAccess } = require("../src/accessRules");

describe("access rules", () => {
  it.each([
    ["charities", "GET", "/", "public"],
    ["charities", "GET", "/spotlight", "public"],
    ["charities", "GET", "/5f00000000000000000000c1", "public"],
    ["charities", "GET", "/donations/me", "auth"], // not mistaken for a charity id
    ["charities", "POST", "/donations", "auth"],
    ["charities", "POST", "/webhook", "public"],
    ["charities", "GET", "/admin/charities", "admin"],
    ["auth", "POST", "/login", "public"],
    ["auth", "GET", "/me", "auth"],
    ["auth", "GET", "/users", "admin"],
    ["subscriptions", "POST", "/webhook", "public"],
    ["subscriptions", "GET", "/status", "auth"],
    ["scores", "GET", "/scores", "subscriber"],
    ["scores", "GET", "/admin/scores", "admin"],
    ["draws", "GET", "/draws/latest", "auth"],
    ["draws", "GET", "/admin/reports/draws", "admin"],
    ["winners", "POST", "/winners/abc/proof", "auth"],
    ["winners", "PATCH", "/admin/winners/abc/payout", "admin"],
    ["draws", "GET", "/health", "public"],
  ])("%s %s %s is %s", (service, method, path, access) => {
    expect(resolveAccess(service, method, path)).toBe(access);
  });

  it("protects any unknown route by default (login required)", () => {
    expect(resolveAccess("charities", "DELETE", "/something-new")).toBe("auth");
  });

  it("refuses everything for an unknown service", () => {
    expect(resolveAccess("nope", "GET", "/x")).toBe("admin");
  });
});
