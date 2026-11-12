const { z } = require("zod");
const { CATEGORIES, MIN_DONATION_RUPEES, MAX_DONATION_RUPEES } = require("../constants");

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .url("Enter a valid URL")
  .refine((value) => value.startsWith("https://"), "URL must start with https://");

const category = z.enum(CATEGORIES, { errorMap: () => ({ message: "Choose a valid category" }) });

const name = z.string({ required_error: "Name is required" }).trim().min(2, "Name must be at least 2 characters").max(120);
const description = z.string({ required_error: "Description is required" }).trim().min(10, "Description must be at least 10 characters").max(2000);

const createCharity = z
  .object({
    name,
    description,
    category,
    website: httpsUrl.optional(),
    logoUrl: httpsUrl.optional(),
    images: z.array(httpsUrl).max(10, "A charity can have at most 10 images").optional(),
    featured: z.boolean().optional(),
  })
  .strict();

const updateCharity = z
  .object({
    name: name.optional(),
    description: description.optional(),
    category: category.optional(),
    website: httpsUrl.optional(),
    logoUrl: httpsUrl.optional(),
    images: z.array(httpsUrl).max(10).optional(),
    featured: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "Nothing to update" });

const createEvent = z
  .object({
    title: z.string({ required_error: "Title is required" }).trim().min(3, "Title must be at least 3 characters").max(120),
    date: z
      .string({ required_error: "Date is required" })
      .datetime({ message: "Date must be an ISO date-time, for example 2027-01-15T09:00:00Z" })
      .transform((value) => new Date(value))
      .refine((date) => date > new Date(), "An event must be in the future"),
    location: z.string().trim().max(200).optional(),
    description: z.string().trim().max(1000).optional(),
  })
  .strict();

const createDonation = z
  .object({
    charityId: objectId,
    amountInr: z
      .number({ required_error: "Amount is required", invalid_type_error: "Amount must be a number" })
      .int("Amount must be a whole number of rupees")
      .min(MIN_DONATION_RUPEES, `Minimum donation is ₹${MIN_DONATION_RUPEES}`)
      .max(MAX_DONATION_RUPEES, `Maximum donation is ₹${MAX_DONATION_RUPEES}`),
  })
  .strict();

module.exports = { createCharity, updateCharity, createEvent, createDonation, objectId };
