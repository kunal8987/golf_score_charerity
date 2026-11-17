const axios = require("axios");

const CHUNK_SIZE = 1000; // the score service accepts up to 5000 per request; stay well under

// Returns { userId: [latest scores, newest first] } for the given users.
async function fetchLatestScores(userIds) {
  const base = process.env.SCORE_SERVICE_URL || "http://localhost:4003";
  const headers = { "x-internal-key": process.env.INTERNAL_API_KEY || "" };
  const merged = {};
  for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + CHUNK_SIZE);
    const { data } = await axios.post(`${base}/internal/scores/batch`, { userIds: chunk }, { headers, timeout: 15000 });
    Object.assign(merged, data.data.scores);
  }
  return merged;
}

module.exports = { fetchLatestScores };
