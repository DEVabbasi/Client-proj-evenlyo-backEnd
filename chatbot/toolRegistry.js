// chatbot/toolRegistry.js
const { checkListingAvailability } = require("./tools/checkAvailability");
const { searchListings }           = require("./tools/searchListings");
const { getSubcategories }         = require("./tools/getSubcategories");
const { getVendorInfo }            = require("./tools/getVendorInfo");
const { getBookingStatus }         = require("./tools/getBookingStatus");
const logger                       = require("../utils/logger");

const TOOL_MAP = {
  check_listing_availability: checkListingAvailability,
  search_listings:            searchListings,
  get_subcategories:          getSubcategories,
  get_vendor_info:            getVendorInfo,
  get_booking_status:         getBookingStatus,
};

async function executeTool(toolName, args, context = {}) {
  const handler = TOOL_MAP[toolName];
  if (!handler) {
    logger.warn(`[ToolRegistry] Unknown tool: ${toolName}`);
    return { error: `Tool "${toolName}" not registered.` };
  }
  try {
    logger.info(`[ToolRegistry] Executing: ${toolName}`, { args });
    const result = await handler(args, context);
    return result;
  } catch (err) {
    logger.error(`[ToolRegistry] "${toolName}" error: ${err.message}`);
    return { error: `Tool failed: ${err.message}` };
  }
}

module.exports = { executeTool };