const { CATEGORIES, COMPATIBILITY, RETURN_CONDITIONS } = require("./checkout-constants");

function cleanString(value, name, options) {
  const settings = options || {};
  const result = String(value == null ? "" : value).trim();

  if (!settings.optional && !result) {
    throw httpError(400, `${name} is required.`);
  }

  if (settings.max && result.length > settings.max) {
    throw httpError(400, `${name} must be ${settings.max} characters or fewer.`);
  }

  return result;
}

function positiveInteger(value, name, allowZero) {
  const result = Number(value);

  if (!Number.isInteger(result) || result < (allowZero ? 0 : 1)) {
    throw httpError(400, `${name} must be ${allowZero ? "zero or a positive" : "a positive"} whole number.`);
  }

  return result;
}

function oneOf(value, allowed, name) {
  if (!allowed.includes(value)) {
    throw httpError(400, `${name} is invalid.`);
  }

  return value;
}

function componentInput(body) {
  const max = body.maxActivePerTeam == null || body.maxActivePerTeam === ""
    ? null
    : positiveInteger(body.maxActivePerTeam, "Maximum per team");

  const imageUrl = cleanString(body.imageUrl, "Image URL", { max: 1000, optional: true });

  if (imageUrl && !/^https?:\/\//i.test(imageUrl) && !imageUrl.startsWith("/")) {
    throw httpError(400, "Image URL must use http(s) or be a site-relative path beginning with /.");
  }

  return {
    name: cleanString(body.name, "Component name", { max: 120 }),
    description: cleanString(body.description, "Description", { max: 2000, optional: true }),
    imageUrl,
    category: oneOf(body.category, CATEGORIES, "Category"),
    compatibility: oneOf(body.compatibility, COMPATIBILITY, "Compatibility"),
    totalQuantity: positiveInteger(body.totalQuantity, "Total quantity", true),
    unavailableQuantity: positiveInteger(body.unavailableQuantity || 0, "Unavailable quantity", true),
    maxActivePerTeam: max,
    active: body.active !== false,
    adminNotes: cleanString(body.adminNotes, "Admin notes", { max: 2000, optional: true })
  };
}

function returnInput(item) {
  const condition = oneOf(item.condition || "good", RETURN_CONDITIONS, "Return condition");
  const note = cleanString(item.note, "Return note", { max: 1000, optional: true });

  if (condition !== "good" && !note) {
    throw httpError(400, `A note is required when hardware is ${condition}.`);
  }

  return {
    componentId: positiveInteger(item.componentId, "Component ID"),
    quantity: positiveInteger(item.quantity, "Return quantity"),
    condition,
    note
  };
}

function httpError(status, message, details) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

module.exports = { cleanString, positiveInteger, oneOf, componentInput, returnInput, httpError };
