/**
 * Resolve a human-readable vendor/supplier name from User + Vendor profile docs.
 */
function getVendorDisplayName(user, vendorProfile) {
  if (!user && !vendorProfile) return "N/A";
  if (vendorProfile?.businessName) return String(vendorProfile.businessName).trim();
  const name = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
  return name || user?.email || "N/A";
}

/**
 * Single source of truth for the `fullName` value the API exposes.
 *
 * Mirrors the User.fullName virtual (business name first, personal name second)
 * but also works on the plain objects produced by `.lean()`, where virtuals do
 * not run. Use this whenever a lean/plain payload is mapped for the response.
 */
function resolveFullName(source) {
  if (!source) return "";

  const plain =
    typeof source === "object" && typeof source.toObject === "function"
      ? source.toObject()
      : source;

  const businessName =
    typeof plain.businessName === "string" ? plain.businessName.trim() : "";
  if (businessName) return businessName;

  return `${plain.firstName || ""} ${plain.lastName || ""}`.trim();
}

/**
 * Copy `resolveFullName` onto a lean/plain payload so the response carries the
 * same `fullName` key a hydrated User document would expose. Mutates in place.
 */
function withFullName(target) {
  if (!target || typeof target !== "object") return target;
  if (!target.fullName) {
    target.fullName = resolveFullName(target);
  }
  return target;
}

const isMongooseDocument = (value) =>
  !!value &&
  typeof value === "object" &&
  (value.$__ != null || typeof value.$set === "function");

const isObjectIdLike = (value) => {
  if (!value) return false;
  if (typeof value === "object" && typeof value.toString === "function") {
    return (
      value._bsontype === "ObjectId" ||
      /^[0-9a-fA-F]{24}$/.test(value.toString())
    );
  }
  if (typeof value === "string") return /^[0-9a-fA-F]{24}$/.test(value);
  return false;
};

const looksLikeVendorUser = (node) =>
  "firstName" in node ||
  "lastName" in node ||
  "businessName" in node ||
  "fullName" in node ||
  "profileImage" in node;

/**
 * Collect every User-shaped vendor block out of an arbitrarily nested payload.
 *
 * Mongoose stores populated refs in the internal `_doc`, so documents are walked
 * through their schema paths (via getters) rather than own properties; plain
 * objects are walked by key. Only nodes carrying a real ObjectId are considered.
 */
function collectVendorUsers(node, out = [], seen = new Set()) {
  if (!node || typeof node !== "object" || Buffer.isBuffer(node)) return out;
  if (seen.has(node)) return out;
  seen.add(node);

  if (Array.isArray(node)) {
    for (const entry of node) collectVendorUsers(entry, out, seen);
    return out;
  }

  const candidateId = node._id || node.id;
  if (isObjectIdLike(candidateId) && looksLikeVendorUser(node)) {
    out.push(node);
    // A User block has no nested vendor refs; do not keep descending.
    return out;
  }

  const isDocument = isMongooseDocument(node);
  const keys = isDocument
    ? Object.keys(node.schema?.paths || {})
    : Object.keys(node);

  for (const key of keys) {
    if (key === "_id" || key.startsWith("$")) continue;

    let value;
    try {
      // Getters are required on documents: a populated `vendor` lives behind one.
      value = isDocument ? node.get(key) : node[key];
    } catch {
      continue;
    }

    if (value && typeof value === "object") {
      collectVendorUsers(value, out, seen);
    }
  }

  return out;
}

/**
 * Refresh `businessName` + `fullName` on every vendor User block in a payload
 * using the Vendor profile as the source of truth.
 *
 * User.businessName is a denormalized copy written by the Vendor model hooks, so
 * it is missing for vendors created before that change (and before the backfill
 * script ran). Without this, those vendors keep serializing `fullName: ""` in
 * every endpoint. Mutates in place; safe to call with an already-correct payload.
 */
async function syncVendorDisplayNames(payload) {
  const Vendor = require("../models/Vendor");

  const vendorUsers = collectVendorUsers(payload);
  if (vendorUsers.length === 0) return payload;

  const userIds = vendorUsers
    .map((u) => u._id || u.id)
    .filter((id) => id && typeof id.toString === "function")
    .map((id) => id.toString());

  if (userIds.length === 0) return payload;

  const profiles = await Vendor.find({ userId: { $in: userIds } })
    .select("userId businessName")
    .lean();

  const businessNameByUserId = new Map();
  for (const profile of profiles) {
    if (profile.businessName) {
      businessNameByUserId.set(
        profile.userId.toString(),
        String(profile.businessName).trim(),
      );
    }
  }

  for (const vendorUser of vendorUsers) {
    const id = (vendorUser._id || vendorUser.id)?.toString();
    const businessName = id ? businessNameByUserId.get(id) : undefined;

    // Only set when the profile actually has one, so personal vendors do not
    // start serializing an empty businessName they never had.
    if (businessName) {
      vendorUser.businessName = businessName;
    }

    if (isMongooseDocument(vendorUser)) {
      // A hydrated doc derives fullName from the fullName virtual, which now
      // reads businessName. Assigning to a getter-only virtual is unreliable,
      // so only the real schema path is written here.
      continue;
    }

    vendorUser.fullName = resolveFullName(vendorUser);
  }

  return payload;
}

/**
 * Normalize client/vendor values for email templates — never stringify full documents.
 */
function formatPartyName(value) {
  if (value == null) return "N/A";
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || "N/A";
  }
  if (typeof value !== "object") return String(value);

  const source =
    typeof value.toObject === "function" ? value.toObject() : value;

  if (source.businessName) {
    const businessName = String(source.businessName).trim();
    if (businessName) return businessName;
  }

  const fullName = `${source.firstName || ""} ${source.lastName || ""}`.trim();
  if (fullName) return fullName;

  if (source.fullName && typeof source.fullName === "string") {
    const trimmed = source.fullName.trim();
    if (trimmed) return trimmed;
  }

  if (source.name && typeof source.name === "string") {
    const trimmed = source.name.trim();
    if (trimmed) return trimmed;
  }

  if (source.email) return String(source.email);

  return "N/A";
}

/**
 * Resolve client display name from a User document or plain object.
 */
function getClientDisplayName(user) {
  return formatPartyName(user);
}

module.exports = {
  getVendorDisplayName,
  formatPartyName,
  getClientDisplayName,
  resolveFullName,
  withFullName,
  collectVendorUsers,
  syncVendorDisplayNames,
};
