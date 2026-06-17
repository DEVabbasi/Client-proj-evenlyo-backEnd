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
};
