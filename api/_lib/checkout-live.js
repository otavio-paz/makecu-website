const DEFAULT_START = "2026-11-07T09:00:00-05:00";
const DEFAULT_END = "2026-11-08T17:00:00-05:00";

function liveStatus(now) {
  const start = new Date(process.env.CHECKOUT_LIVE_START || DEFAULT_START);
  const end = new Date(process.env.CHECKOUT_LIVE_END || DEFAULT_END);
  const current = now || new Date();
  const forced = process.env.CHECKOUT_FORCE_LIVE === "true";
  const live = forced || (current >= start && current <= end);

  return {
    live,
    forced,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    serverTime: current.toISOString()
  };
}

module.exports = { DEFAULT_START, DEFAULT_END, liveStatus };
