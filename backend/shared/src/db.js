const mongoose = require("mongoose");
const { logger } = require("./logger");

async function connectDb(uri, name) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  logger.info(`${name} connected to MongoDB`);
}

module.exports = { connectDb };
