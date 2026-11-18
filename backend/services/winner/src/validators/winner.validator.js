const { z } = require("zod");

const review = z
  .object({
    decision: z.enum(["approve", "reject"], { errorMap: () => ({ message: "Decision must be approve or reject" }) }),
    reason: z.string().trim().min(5, "Give a reason of at least 5 characters").max(500).optional(),
  })
  .strict()
  .refine((d) => d.decision === "approve" || Boolean(d.reason), {
    message: "A reason is required when rejecting proof",
    path: ["reason"],
  });

module.exports = { review };
