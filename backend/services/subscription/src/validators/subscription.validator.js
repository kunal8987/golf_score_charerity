const { z } = require("zod");

const checkout = z
  .object({
    plan: z.enum(["monthly", "yearly"], {
      errorMap: () => ({ message: "Plan must be monthly or yearly" }),
    }),
  })
  .strict();

module.exports = { checkout };
