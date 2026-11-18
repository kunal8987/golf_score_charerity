const axios = require("axios");

const base = () => process.env.DRAW_SERVICE_URL || "http://localhost:4005";
const headers = () => ({ "x-internal-key": process.env.INTERNAL_API_KEY || "" });

// Every winning entry in a published draw
async function fetchWinners() {
  const { data } = await axios.get(`${base()}/internal/winners`, { headers: headers(), timeout: 10000 });
  return data.data.winners;
}

// Mirrors a payout status onto the subscriber's draw history
async function setPayout(drawResultId, payoutStatus) {
  await axios.patch(
    `${base()}/internal/results/${drawResultId}/payout`,
    { payoutStatus },
    { headers: headers(), timeout: 10000 }
  );
}

module.exports = { fetchWinners, setPayout };
