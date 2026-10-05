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

module.exports = { CATEGORIES, COMPATIBILITY, ORDER_STATUSES, RETURN_CONDITIONS, RELATIONSHIP_TYPES };
