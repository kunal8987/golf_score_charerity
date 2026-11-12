const mongoose = require("mongoose");
const { CATEGORIES } = require("../constants");

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
  date: { type: Date, required: true },
  location: { type: String, trim: true, maxlength: 200, default: "" },
  description: { type: String, trim: true, maxlength: 1000, default: "" },
});

const charitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true }, // used in URLs
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    category: { type: String, required: true, enum: CATEGORIES, index: true },
    website: { type: String, trim: true, default: "" },
    logoUrl: { type: String, default: "" },
    images: { type: [String], default: [] }, // Cloudinary or other https URLs
    featured: { type: Boolean, default: false, index: true }, // shown in the homepage spotlight
    active: { type: Boolean, default: true, index: true }, // false = deleted from the public site
    events: { type: [eventSchema], default: [] }, // golf days and other fundraising events
  },
  { timestamps: true }
);

module.exports = mongoose.models.Charity || mongoose.model("Charity", charitySchema);
