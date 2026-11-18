process.env.LOG_LEVEL = "silent";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-at-least-thirty-two-characters";
process.env.WINNER_SYNC_TTL_MS = "0"; // every read syncs, so tests see the latest winners

jest.mock("../src/models/Winner", () => require("./helpers/fakeWinnerModel"));
jest.mock("../src/services/drawClient", () => ({ fetchWinners: jest.fn(), setPayout: jest.fn() }));
jest.mock("../src/services/proofStorage", () => ({ uploadProof: jest.fn(), signedProofUrl: jest.fn() }));

const request = require("supertest");
const { notFound, errorHandler, signToken } = require("@dh/shared");
const Winner = require("./helpers/fakeWinnerModel");
const drawClient = require("../src/services/drawClient");
const storage = require("../src/services/proofStorage");
const { createApp } = require("../src/app");

const app = createApp();
app.use(notFound);
app.use(errorHandler);

const A = "5f0000000000000000000001";
const B = "5f0000000000000000000002";
const ADMIN = "5f0000000000000000000009";
const aToken = signToken({ _id: A, role: "subscriber" });
const bToken = signToken({ _id: B, role: "subscriber" });
const adminToken = signToken({ _id: ADMIN, role: "admin" });
const auth = (token) => ({ Authorization: `Bearer ${token}` });

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200)]);

const W_A = "5f00000000000000000000a1"; // A's winning entry
const W_B = "5f00000000000000000000b1"; // B's winning entry
const drawWinners = () => [
  { drawResultId: W_A, drawId: "5f00000000000000000000d1", userId: A, month: "2026-10", tier: "five", matches: 5, prizePaise: 12000 },
  { drawResultId: W_B, drawId: "5f00000000000000000000d1", userId: B, month: "2026-10", tier: "three", matches: 3, prizePaise: 7500 },
];

beforeEach(() => {
  Winner.reset();
  jest.clearAllMocks();
  drawClient.fetchWinners.mockImplementation(async () => drawWinners());
  drawClient.setPayout.mockResolvedValue(undefined);
  storage.uploadProof.mockResolvedValue({ publicId: "digital-heroes/proofs/abc" });
  storage.signedProofUrl.mockReturnValue("https://res.cloudinary.com/demo/signed-link");
});

// Gets A's (or B's) winning id through the subscriber endpoint, which also syncs
async function winningIdFor(token) {
  const res = await request(app).get("/winners/me").set(auth(token));
  return res.body.data.winnings[0].id;
}

const uploadAs = (token, id, buffer, filename = "scores.jpg", contentType = "image/jpeg") =>
  request(app)
    .post(`/winners/${id}/proof`)
    .set(auth(token))
    .attach("proof", buffer, { filename, contentType });

describe("syncing winners from the draw service", () => {
  it("creates one record per winning entry, awaiting proof", async () => {
    await request(app).get("/winners/me").set(auth(aToken));
    expect(Winner.all()).toHaveLength(2);
    expect(Winner.all()[0]).toMatchObject({ verificationStatus: "awaiting_proof", payoutStatus: "pending" });
  });

  it("does not duplicate winners when synced again", async () => {
    await request(app).get("/winners/me").set(auth(aToken));
    await request(app).get("/winners/me").set(auth(aToken));
    expect(Winner.all()).toHaveLength(2);
  });

  it("still shows stored winners if the draw service is down", async () => {
    await request(app).get("/winners/me").set(auth(aToken)); // store them first
    drawClient.fetchWinners.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await request(app).get("/winners/me").set(auth(aToken));
    expect(res.status).toBe(200);
    expect(res.body.data.synced).toBe(false);
    expect(res.body.data.winnings).toHaveLength(1);
  });
});

describe("access", () => {
  it("requires login", async () => {
    expect((await request(app).get("/winners/me")).status).toBe(401);
  });

  it("subscribers cannot use admin routes", async () => {
    expect((await request(app).get("/admin/winners").set(auth(aToken))).status).toBe(403);
  });
});

describe("the subscriber's winnings", () => {
  it("shows only their own winnings and totals", async () => {
    const res = await request(app).get("/winners/me").set(auth(aToken));
    expect(res.body.data.winnings).toHaveLength(1);
    expect(res.body.data.winnings[0]).toMatchObject({ tier: "five", prizeInr: 120, verificationStatus: "awaiting_proof" });
    expect(res.body.data.totals).toEqual({ wonInr: 120, paidInr: 0, pendingInr: 120 });
  });
});

describe("uploading proof (PRD 09)", () => {
  it("accepts a JPEG and moves the winning to pending review", async () => {
    const id = await winningIdFor(aToken);
    const res = await uploadAs(aToken, id, JPEG);
    expect(res.status).toBe(200);
    expect(res.body.data.winning.verificationStatus).toBe("pending_review");
    expect(storage.uploadProof).toHaveBeenCalledWith(expect.any(Buffer), expect.anything(), "image/jpeg");
  });

  it("accepts a PNG", async () => {
    const id = await winningIdFor(aToken);
    const res = await uploadAs(aToken, id, PNG, "scores.png", "image/png");
    expect(res.status).toBe(200);
    expect(Winner.all()[0].proof.mimeType).toBe("image/png");
  });

  it("rejects a text file renamed to .jpg, because the content decides the type", async () => {
    const id = await winningIdFor(aToken);
    const res = await uploadAs(aToken, id, Buffer.from("this is not an image at all"));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/JPEG or PNG/);
    expect(storage.uploadProof).not.toHaveBeenCalled();
  });

  it("rejects a file over 5 MB", async () => {
    const id = await winningIdFor(aToken);
    const big = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await uploadAs(aToken, id, big);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/5 MB/);
  });

  it("rejects a request with no file", async () => {
    const id = await winningIdFor(aToken);
    const res = await request(app).post(`/winners/${id}/proof`).set(auth(aToken));
    expect(res.status).toBe(400);
  });

  it("another user cannot upload to a winning entry that is not theirs (404)", async () => {
    const id = await winningIdFor(aToken);
    expect((await uploadAs(bToken, id, JPEG)).status).toBe(404);
  });

  it("does not allow a second upload while the first is waiting for review", async () => {
    const id = await winningIdFor(aToken);
    await uploadAs(aToken, id, JPEG);
    const res = await uploadAs(aToken, id, JPEG);
    expect(res.status).toBe(409);
  });

  it("allows a new upload after a rejection, and clears the old reason", async () => {
    const id = await winningIdFor(aToken);
    await uploadAs(aToken, id, JPEG);
    await request(app)
      .patch(`/admin/winners/${id}/review`)
      .set(auth(adminToken))
      .send({ decision: "reject", reason: "Screenshot is cropped" });

    const res = await uploadAs(aToken, id, PNG, "scores.png", "image/png");
    expect(res.status).toBe(200);
    expect(res.body.data.winning.verificationStatus).toBe("pending_review");
    expect(res.body.data.winning.rejectionReason).toBe("");
  });

  it("refuses to change proof once the prize is verified", async () => {
    const id = await winningIdFor(aToken);
    await uploadAs(aToken, id, JPEG);
    await request(app).patch(`/admin/winners/${id}/review`).set(auth(adminToken)).send({ decision: "approve" });
    expect((await uploadAs(aToken, id, JPEG)).status).toBe(409);
  });
});

describe("reviewing proof (admin)", () => {
  it("approves a submitted screenshot and records who reviewed it", async () => {
    const id = await winningIdFor(aToken);
    await uploadAs(aToken, id, JPEG);
    const res = await request(app)
      .patch(`/admin/winners/${id}/review`)
      .set(auth(adminToken))
      .send({ decision: "approve" });
    expect(res.status).toBe(200);
    expect(res.body.data.winning.verificationStatus).toBe("approved");
    expect(Winner.all()[0].reviewedBy).toBe(ADMIN);
  });

  it("requires a reason when rejecting", async () => {
    const id = await winningIdFor(aToken);
    await uploadAs(aToken, id, JPEG);
    const res = await request(app).patch(`/admin/winners/${id}/review`).set(auth(adminToken)).send({ decision: "reject" });
    expect(res.status).toBe(400);
  });

  it("stores the rejection reason", async () => {
    const id = await winningIdFor(aToken);
    await uploadAs(aToken, id, JPEG);
    const res = await request(app)
      .patch(`/admin/winners/${id}/review`)
      .set(auth(adminToken))
      .send({ decision: "reject", reason: "Scores do not match the draw date" });
    expect(res.body.data.winning.verificationStatus).toBe("rejected");
    expect(res.body.data.winning.rejectionReason).toBe("Scores do not match the draw date");
  });

  it("cannot review a winning that has no screenshot yet", async () => {
    const id = await winningIdFor(aToken);
    const res = await request(app).patch(`/admin/winners/${id}/review`).set(auth(adminToken)).send({ decision: "approve" });
    expect(res.status).toBe(409);
  });
});

describe("paying out (PRD 09: Pending to Paid)", () => {
  async function approvedWinning() {
    const id = await winningIdFor(aToken);
    await uploadAs(aToken, id, JPEG);
    await request(app).patch(`/admin/winners/${id}/review`).set(auth(adminToken)).send({ decision: "approve" });
    return id;
  }

  it("refuses to pay a prize that has not been verified", async () => {
    const id = await winningIdFor(aToken);
    const res = await request(app).patch(`/admin/winners/${id}/payout`).set(auth(adminToken));
    expect(res.status).toBe(409);
    expect(drawClient.setPayout).not.toHaveBeenCalled();
  });

  it("marks a verified prize paid and mirrors it to the draw service", async () => {
    const id = await approvedWinning();
    const res = await request(app).patch(`/admin/winners/${id}/payout`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.winning.payoutStatus).toBe("paid");
    expect(drawClient.setPayout).toHaveBeenCalledWith(W_A, "paid");
  });

  it("can only pay once", async () => {
    const id = await approvedWinning();
    await request(app).patch(`/admin/winners/${id}/payout`).set(auth(adminToken));
    const again = await request(app).patch(`/admin/winners/${id}/payout`).set(auth(adminToken));
    expect(again.status).toBe(409);
    expect(drawClient.setPayout).toHaveBeenCalledTimes(1);
  });

  it("undoes the payment if the draw service cannot be updated", async () => {
    const id = await approvedWinning();
    drawClient.setPayout.mockRejectedValue(new Error("ECONNRESET"));
    const res = await request(app).patch(`/admin/winners/${id}/payout`).set(auth(adminToken));

    expect(res.status).toBe(503);
    expect(Winner.all()[0].payoutStatus).toBe("pending");
    expect(Winner.all()[0].paidAt).toBeNull();
  });

  it("the subscriber sees the paid status and totals update", async () => {
    const id = await approvedWinning();
    await request(app).patch(`/admin/winners/${id}/payout`).set(auth(adminToken));
    const res = await request(app).get("/winners/me").set(auth(aToken));
    expect(res.body.data.winnings[0].payoutStatus).toBe("paid");
    expect(res.body.data.totals).toEqual({ wonInr: 120, paidInr: 120, pendingInr: 0 });
  });
});

describe("admin list and detail", () => {
  it("lists every winner, syncing first", async () => {
    const res = await request(app).get("/admin/winners").set(auth(adminToken));
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.synced).toBe(true);
  });

  it("filters by verification status", async () => {
    await winningIdFor(aToken);
    const id = Winner.all().find((w) => String(w.userId) === A)._id;
    await uploadAs(aToken, id, JPEG);

    const res = await request(app).get("/admin/winners?verificationStatus=pending_review").set(auth(adminToken));
    expect(res.body.data.winners).toHaveLength(1);
    expect(res.body.data.winners[0].verificationStatus).toBe("pending_review");
  });

  it("shows the proof through a signed link, not a public URL", async () => {
    const id = await winningIdFor(aToken);
    await uploadAs(aToken, id, JPEG);
    const res = await request(app).get(`/admin/winners/${id}`).set(auth(adminToken));
    expect(res.body.data.winning.proofUrl).toBe("https://res.cloudinary.com/demo/signed-link");
    expect(storage.signedProofUrl).toHaveBeenCalledWith("digital-heroes/proofs/abc");
  });

  it("shows no proof link when nothing has been uploaded", async () => {
    const id = await winningIdFor(aToken);
    const res = await request(app).get(`/admin/winners/${id}`).set(auth(adminToken));
    expect(res.body.data.winning.proofUrl).toBeNull();
  });

  it("rejects a malformed winner id", async () => {
    expect((await request(app).get("/admin/winners/not-an-id").set(auth(adminToken))).status).toBe(400);
  });
});
