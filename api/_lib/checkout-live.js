const DEFAULT_START = "2026-11-07T09:00:00-05:00";
const DEFAULT_END = "2026-11-08T17:00:00-05:00";

function liveStatus(now) {
  const start = new Date(process.env.CHECKOUT_LIVE_START || DEFAULT_START);
  const orderingEnd = new Date(process.env.CHECKOUT_ORDERING_END || process.env.CHECKOUT_LIVE_END || DEFAULT_END);
  const returnEnd = new Date(process.env.CHECKOUT_RETURN_END || process.env.CHECKOUT_LIVE_END || DEFAULT_END);
  const current = now || new Date();
  const forced = process.env.NODE_ENV !== "production" && process.env.CHECKOUT_FORCE_LIVE === "true";
  const orderingOpen = forced || (current >= start && current <= orderingEnd);
  const returnsOpen = forced || (current >= start && current <= returnEnd);
  const live = orderingOpen || returnsOpen;
  const phase = forced ? "event_active" : current < start ? "before_event" :
    orderingOpen ? "event_active" : returnsOpen ? "return_period" : "closed";

  return {
    live,
    forced,
    phase,
    orderingOpen,
    returnsOpen,
    startsAt: start.toISOString(),
    orderingEndsAt: orderingEnd.toISOString(),
    returnEndsAt: returnEnd.toISOString(),
    endsAt: returnEnd.toISOString(),
    serverTime: current.toISOString()
  };
}

module.exports = { DEFAULT_START, DEFAULT_END, liveStatus };
