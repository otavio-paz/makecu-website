const DEFAULT_START = "2026-10-13T00:00:00-04:00";

function liveStatus(now) {
  const start = new Date(process.env.CHECKOUT_LIVE_START || DEFAULT_START);
  const current = now || new Date();
  const forced = process.env.NODE_ENV !== "production" && process.env.CHECKOUT_FORCE_LIVE === "true";
  // Access stays open after the scheduled start. Legacy end-time settings must
  // not close ordering, pickup, or returns while the hardware desk is operating.
  const live = forced || current >= start;

  return {
    live,
    forced,
    phase: live ? "event_active" : "before_event",
    orderingOpen: live,
    returnsOpen: live,
    startsAt: start.toISOString(),
    orderingEndsAt: null,
    returnEndsAt: null,
    endsAt: null,
    serverTime: current.toISOString()
  };
}

module.exports = { DEFAULT_START, liveStatus };
