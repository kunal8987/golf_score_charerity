// India Standard Time is UTC+05:30 all year (India has no daylight saving time),
// so a fixed offset is exact and needs no timezone database.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Shifts a UTC instant to IST. The returned Date's UTC fields hold the IST wall-clock values.
function toIstWallClock(date) {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

// Today's (or any instant's) calendar date in IST, as "YYYY-MM-DD".
// Use this, not the UTC date, for anything a user in India sees as "today".
function istDateString(date = new Date()) {
  return toIstWallClock(date).toISOString().slice(0, 10);
}

// ISO 8601 with the IST offset written out: "2024-03-01T05:30:00+05:30"
function toIstIso(date) {
  return `${toIstWallClock(date).toISOString().slice(0, 19)}+05:30`;
}

// Human-readable: "2024-03-01 05:30 IST"
function formatIst(date) {
  const wall = toIstWallClock(date).toISOString();
  return `${wall.slice(0, 10)} ${wall.slice(11, 16)} IST`;
}

module.exports = { IST_OFFSET_MS, toIstWallClock, istDateString, toIstIso, formatIst };
