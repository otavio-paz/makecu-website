const CATEGORIES = [
  "Audio",
  "Button",
  "Camera",
  "Communication",
  "Distance",
  "Electronics",
  "Microcontroller",
  "Motor",
  "Motor Related",
  "Pi-related",
  "Power",
  "Sensor",
  "Tool"
];

const COMPATIBILITY = ["Arduino", "Raspberry Pi", "Arduino + Raspberry Pi", "N/A"];
const ORDER_STATUSES = ["submitted", "reviewing", "accepted", "ready", "picked_up", "cancelled", "expired"];
const RETURN_CONDITIONS = ["good", "damaged", "missing"];
const RELATIONSHIP_TYPES = ["requires", "recommends", "compatible_driver", "compatible_power_supply"];
const MAX_DISTINCT_ORDER_ITEMS = 10;
const CLAIM_LEASE_MINUTES = 60;
const MIN_ORDER_COOLDOWN_MINUTES = 10;
const MAX_ORDER_COOLDOWN_MINUTES = 60;

function orderCooldownMinutes(distinctItemCount) {
  const count = Math.max(1, Math.min(MAX_DISTINCT_ORDER_ITEMS, distinctItemCount));
  return Math.ceil(MIN_ORDER_COOLDOWN_MINUTES +
    (count - 1) * (MAX_ORDER_COOLDOWN_MINUTES - MIN_ORDER_COOLDOWN_MINUTES) /
    (MAX_DISTINCT_ORDER_ITEMS - 1));
}

module.exports = {
  CATEGORIES,
  COMPATIBILITY,
  MAX_DISTINCT_ORDER_ITEMS,
  CLAIM_LEASE_MINUTES,
  orderCooldownMinutes,
  ORDER_STATUSES,
  RETURN_CONDITIONS,
  RELATIONSHIP_TYPES
};
