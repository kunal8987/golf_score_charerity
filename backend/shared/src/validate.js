const { AppError } = require("./errors");

// Validates req.body with a zod schema. On success req.body is replaced with the
// parsed data (unknown fields are rejected by .strict() in the schema).
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues.map((issue) => issue.message).join("; ");
      return next(new AppError(message, 400));
    }
    req.body = result.data;
    return next();
  };
}

module.exports = { validate };
