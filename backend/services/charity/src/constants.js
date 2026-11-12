// Shared constants for the charity service

const CATEGORIES = ["health", "education", "children", "environment", "animals", "community", "other"];

// Donations are in Indian rupees. Stripe amounts are in paise (1 rupee = 100 paise).
const MIN_DONATION_RUPEES = 100;
const MAX_DONATION_RUPEES = 100000;
const CURRENCY = "inr";

module.exports = { CATEGORIES, MIN_DONATION_RUPEES, MAX_DONATION_RUPEES, CURRENCY };
