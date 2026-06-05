const ActivityLog = require('../models/ActivityLog');

const createActivityLog = async ({ ActivityType, heading, type, description, bookingId, userId, vendorId, metadata = {} }) => {
  console.log( ActivityType, heading, type, description, bookingId, userId, vendorId, metadata = {}," ActivityType, heading, type, description, bookingId, userId, vendorId, metadata = {} ActivityType, heading, type, description, bookingId, userId, vendorId, metadata = {}");
  
  try {
    const log = await ActivityLog.create({
      heading,
      type,
      ActivityType,
      description,
      bookingId,
      userId,
      vendorId,
      metadata
    });
    console.log(`Activity log created: ${type} for booking ${bookingId}`);
    return log;
  } catch (error) {
    console.error('Failed to create activity log:', error); // this not working will not break the main flow
    return null;
  }
};

module.exports = { createActivityLog };