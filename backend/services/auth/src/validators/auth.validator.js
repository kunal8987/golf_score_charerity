const { z } = require("zod");

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

const password = z
  .string({ required_error: "Password is required" })
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/\d/, "Password must contain a number");

const name = z
  .string({ required_error: "Name is required" })
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(80, "Name must be at most 80 characters");

const email = z
  .string({ required_error: "Email is required" })
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);

const charityPercentage = z
  .number({ invalid_type_error: "Charity percentage must be a number" })
  .min(10, "Minimum charity contribution is 10%")
  .max(100, "Charity percentage cannot exceed 100%");

// .strict() rejects unknown keys, so a client cannot send "role" to make itself admin
const signup = z
  .object({
    name,
    email,
    password,
    charityId: objectId.optional(),
    charityPercentage: charityPercentage.optional(),
  })
  .strict();

const login = z
  .object({
    email,
    password: z.string({ required_error: "Password is required" }).min(1, "Password is required"),
  })
  .strict();

const updateProfile = z
  .object({
    name: name.optional(),
    charityId: objectId.nullable().optional(),
    charityPercentage: charityPercentage.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "Nothing to update" });

const adminUpdate = z
  .object({
    name: name.optional(),
    role: z.enum(["subscriber", "admin"], { errorMap: () => ({ message: "Role must be subscriber or admin" }) }).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "Nothing to update" });

module.exports = { signup, login, updateProfile, adminUpdate, password };
