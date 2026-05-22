const BookingRequest = require('../models/Booking');
const Listing = require('../models/Listing');
const SubCategory = require('../models/SubCategory');

/**
 * Check if a listing is available for the given date range
 * @param {string} listingId - The listing ID to check
 * @param {Date} startDate - Start date of the booking
 * @param {Date} endDate - End date of the booking
 * @returns {Promise<boolean>} - True if available, false if conflicting bookings exist
 */
const checkListingAvailability = async (listingId, startDate, endDate) => {
  try {
    // Check for overlapping bookings that are not rejected or cancelled
    const overlappingBookings = await BookingRequest.find({
      listingId,
      status: { $nin: ['rejected', 'cancelled'] },
      $or: [
        {
          'details.startDate': { $lte: endDate },
          'details.endDate': { $gte: startDate }
        }
      ]
    });

    return overlappingBookings.length === 0;
  } catch (error) {
    console.error('Error checking listing availability:', error);
    throw new Error('Failed to check availability');
  }
};

/**
 * Get conflicting bookings for a listing in the given date range
 * @param {string} listingId - The listing ID to check
 * @param {Date} startDate - Start date of the booking
 * @param {Date} endDate - End date of the booking
 * @returns {Promise<Array>} - Array of conflicting bookings
 */
const getConflictingBookings = async (listingId, startDate, endDate) => {
  try {
    const conflictingBookings = await BookingRequest.find({
      listingId,
      status: { $nin: ['rejected', 'cancelled'] },
      $or: [
        {
          'details.startDate': { $lte: endDate },
          'details.endDate': { $gte: startDate }
        }
      ]
    }).select('details.startDate details.endDate status trackingId userId')
      .populate('userId', 'firstName lastName');

    return conflictingBookings;
  } catch (error) {
    console.error('Error getting conflicting bookings:', error);
    throw new Error('Failed to get conflicting bookings');
  }
};

/**
 * Calculate duration between two dates
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Object} - Object containing hours and days
 */
const calculateDuration = (startDate, endDate) => {
  const diffTime = Math.abs(new Date(endDate) - new Date(startDate));
  const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  const diffHours = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60)));

  return {
    hours: diffHours,
    days: diffDays
  };
};

/**
 * Calculate booking price based on listing pricing and duration
 * @param {Object} listing - The listing object
 * @param {Object} duration - Duration object with hours and days
 * @returns {number} - Calculated price
 */
const calculateBookingPrice = (listing, duration) => {
  let bookingPrice = 0;

  if (listing.pricing.type === 'daily' && listing.pricing.perDay) {
    bookingPrice = listing.pricing.perDay * duration.days;
  } else if (listing.pricing.type === 'hourly' && listing.pricing.perHour) {
    bookingPrice = listing.pricing.perHour * duration.hours;
  } else if (listing.pricing.type === 'per_event' && listing.pricing.perEvent) {
    bookingPrice = listing.pricing.perEvent;
  } else if (listing.pricing.type === 'package' && listing.pricing.packages && listing.pricing.packages.length > 0) {
    // Default to first package price if no specific package is selected
    bookingPrice = listing.pricing.packages[0].price;
  }

  return bookingPrice;
};

/**
 * Validate booking details
 * @param {Object} details - Booking details object
 * @returns {Object} - Validation result with isValid and errors
 */
const validateBookingDetails = (details) => {
  const errors = [];

  if (!details.startDate) {
    errors.push('Start date is required');
  }

  if (!details.endDate) {
    errors.push('End date is required');
  }

  if (!details.startTime) {
    errors.push('Start time is required');
  }

  if (!details.endTime) {
    errors.push('End time is required');
  }

  if (!details.eventLocation) {
    errors.push('Event location is required');
  }

  // Validate date range
  if (details.startDate && details.endDate) {
    const start = new Date(details.startDate);
    const end = new Date(details.endDate);

    if (start >= end) {
      errors.push('Start date must be before end date');
    }

    // Check if booking is for the future
    if (start < new Date()) {
      errors.push('Booking date cannot be in the past');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Generate a unique tracking ID
 * @returns {string} - Unique tracking ID
 */
const generateTrackingId = () => {
  const random = Math.random().toString(36).substr(2, 5).toUpperCase();
  return `TRK${random}`;
};

/**
 * Format price for display
 * @param {number} price - Price amount
 * @param {string} currency - Currency code (default: EUR)
 * @returns {string} - Formatted price string
 */
const formatPrice = (price, currency = 'EUR') => {
  return new Intl.NumberFormat('en-EU', {
    style: 'currency',
    currency: currency
  }).format(price);
};

/**
 * Check if requested time slot is within available time slots
 * @param {Array} availableTimeSlots - Array of available time slots with startTime and endTime
 * @param {string} requestedStartTime - Requested start time (HH:MM format)
 * @param {string} requestedEndTime - Requested end time (HH:MM format)
 * @returns {boolean} - True if time slot is available
 */
const checkTimeSlotAvailability = (availableTimeSlots, requestedStartTime, requestedEndTime) => {
  if (!availableTimeSlots || availableTimeSlots.length === 0) {
    return true; // No time restrictions
  }

  const requestedStart = timeToMinutes(requestedStartTime);
  const requestedEnd = timeToMinutes(requestedEndTime);

  // Check if requested time falls within any available slot
  return availableTimeSlots.some(slot => {
    const slotStart = timeToMinutes(slot.startTime);
    const slotEnd = timeToMinutes(slot.endTime);

    return requestedStart >= slotStart && requestedEnd <= slotEnd;
  });
};

/**
 * Check if two time ranges overlap
 * @param {string} start1 - Start time of first range (HH:MM)
 * @param {string} end1 - End time of first range (HH:MM)
 * @param {string} start2 - Start time of second range (HH:MM)
 * @param {string} end2 - End time of second range (HH:MM)
 * @returns {boolean} - True if times overlap
 */
const checkTimeOverlap = (start1, end1, start2, end2) => {
  const start1Minutes = timeToMinutes(start1);
  const end1Minutes = timeToMinutes(end1);
  const start2Minutes = timeToMinutes(start2);
  const end2Minutes = timeToMinutes(end2);

  // Check if ranges overlap
  return start1Minutes < end2Minutes && end1Minutes > start2Minutes;
};

/**
 * Convert time string (HH:MM) to minutes since midnight
 * @param {string} timeString - Time in HH:MM format
 * @returns {number} - Minutes since midnight
 */
const timeToMinutes = (timeString) => {
  if (!timeString || typeof timeString !== 'string') {
    return 0;
  }

  const [hours, minutes] = timeString.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

/**
 * Get day of week abbreviation
 * @param {Date} date - Date object
 * @returns {string} - Day abbreviation (mon, tue, wed, etc.)
 */
const getDayOfWeek = (date) => {
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return days[date.getDay()];
};

/**
 * Calculate full booking pricing details (booking price, fees, km charge, totals)
 * @param {Object} listing - Listing document
 * @param {Object} opts - { startDate, endDate, startTime, endTime, numberOfEvents, distanceKm }
 * @returns {Object} - pricing breakdown or { error, status }
 */
const calculateFullBookingPrice = (listing, opts = {}) => {
  try {
    const { startDate, endDate, startTime, endTime, numberOfEvents, distanceKm } = opts;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // include both days
    const isMultiDay = diffDays > 1;

    // calculate hours
    const calculateHours = (s, e) => {
      const sObj = new Date(`2000-01-01 ${s}`);
      const eObj = new Date(`2000-01-01 ${e}`);
      let diffHours = (eObj - sObj) / (1000 * 60 * 60);
      if (diffHours < 0) diffHours += 24;
      return Math.max(diffHours, 0);
    };

    let dailyHours = 0;
    let totalHours = 0;
    if (startTime && endTime) {
      dailyHours = calculateHours(startTime, endTime);
      totalHours = isMultiDay ? dailyHours * diffDays : dailyHours;
    } else {
      dailyHours = isMultiDay ? 24 : 0;
      totalHours = diffDays * 24;
    }

    const extratimeCost = listing.pricing.extratimeCost || 0;
    const securityFee = listing.pricing.securityFee || 0;

    // validate pricing amount
    if (!listing.pricing.type || typeof listing.pricing.amount !== 'number') {
      return { error: 'Listing pricing information is invalid.', status: 400 };
    }

    const pricingType = (listing.pricing.type || '').toString().toLowerCase();
    const eventsCount = Number(numberOfEvents) > 0 ? Number(numberOfEvents) : 1;
    console.log('Pricing Type:', pricingType);
    let bookingPrice = 0;
    if (pricingType === 'PerHour' || pricingType === 'hourly' || pricingType === 'perhour' || pricingType === 'per hour') {
      bookingPrice = listing.pricing.amount * totalHours;
    } else if (pricingType === 'PerDay' || pricingType === 'daily' || pricingType === 'perday' || pricingType === 'per day') {
      bookingPrice = listing.pricing.amount * diffDays;
    } else if (pricingType === 'PerEvent' || pricingType === 'event' || pricingType === 'perevent' || pricingType === 'per event') {
      bookingPrice = listing.pricing.amount * eventsCount;
    } else if (pricingType === 'fixed' || pricingType === 'fixedprice' || pricingType === 'one-time' || pricingType === 'fixed price' || pricingType === 'one time') {
      bookingPrice = listing.pricing.amount;
    } else {
      return { error: 'Unsupported pricing type.', status: 400 };
    }

    // km charge
    let kmCharge = 0;
    if (typeof listing.pricing.pricePerKm === 'number' && Number(distanceKm) > 0) {
      kmCharge = Math.round(listing.pricing.pricePerKm * Number(distanceKm) * 100) / 100;
    }

    console.log('Booking Price Calculation:', {
      bookingPrice,
      extratimeCost,
      securityFee,
      kmCharge
    });

    // subtotal, system fee and total
    const subtotal = bookingPrice + extratimeCost + securityFee + kmCharge;
    const systemFeePercent = 0.02;
    const systemFee = Math.round(subtotal * systemFeePercent * 100) / 100;
    const totalPrice = Math.round((subtotal + systemFee) * 100) / 100;

    const result = {
      bookingPrice,
      extratimeCost,
      securityFee,
      kmCharge,
      subtotal,
      systemFee,
      systemFeePercent,
      totalPrice,
      dailyHours,
      totalHours,
      diffDays,
      isMultiDay,
      dailyRate: isMultiDay ? Math.round(bookingPrice / diffDays) : null
    };

    return result;
  } catch (e) {
    console.error('Error calculating booking price:', e);
    return { error: 'Failed to calculate booking price', status: 500 };
  }
};





// Helper function to get detailed availability information
const getAvailabilityDetails = async (listingId, startDate, endDate, excludeBookingId = null, startTime = null, endTime = null) => {
  const isAvailable = await checkAvailability(listingId, startDate, endDate, excludeBookingId, startTime, endTime);

  if (!isAvailable) {
    // Get conflicting bookings for detailed response
    const query = {
      listingId,
      status: { $nin: ['rejected', 'cancelled'] },
      $or: [
        {
          'details.startDate': { $lte: new Date(endDate) },
          'details.endDate': { $gte: new Date(startDate) }
        }
      ]
    };

    if (excludeBookingId) {
      query._id = { $ne: excludeBookingId };
    }

    const conflictingBookings = await BookingRequest.find(query)
      .select('details.startDate details.endDate details.startTime details.endTime status trackingId')
      .lean();

    return {
      isAvailable: false,
      conflictingBookings: conflictingBookings.map(booking => ({
        trackingId: booking.trackingId,
        startDate: booking.details.startDate,
        endDate: booking.details.endDate,
        startTime: booking.details.startTime,
        endTime: booking.details.endTime,
        status: booking.status
      }))
    };
  }

  return { isAvailable: true, conflictingBookings: [] };
};

// Helper function to check listing availability for multi-day bookings and time slots
const checkAvailability = async (listingId, startDate, endDate, excludeBookingId = null, startTime = null, endTime = null) => {
  try {
    // Get listing details to check time slots
    const listing = await Listing.findById(listingId).select('availability');
    if (!listing) {
      throw new Error('Listing not found');
    }

    // Check if listing is available
    if (!listing.availability?.isAvailable) {
      console.log(`Listing ${listingId} is marked as unavailable`);
      return false;
    }

    // Normalize dates to start of day for accurate comparison
    const checkStart = new Date(startDate);
    checkStart.setHours(0, 0, 0, 0);

    const checkEnd = new Date(endDate);
    checkEnd.setHours(23, 59, 59, 999);

    // Check if it's a single day booking
    const isSingleDay = checkStart.getTime() === checkEnd.setHours(0, 0, 0, 0);

    // For single day bookings, check time availability
    if (isSingleDay && startTime && endTime && listing.availability?.availableTimeSlots?.length > 0) {
      const isTimeAvailable = checkTimeSlotAvailability(
        listing.availability.availableTimeSlots,
        startTime,
        endTime
      );

      if (!isTimeAvailable) {
        console.log(`Time slot ${startTime}-${endTime} is not available for listing ${listingId}`);
        return false;
      }
    }

    // Check day of week availability
    if (listing.availability?.availableDays?.length > 0) {
      const dayOfWeek = getDayOfWeek(checkStart);
      if (!listing.availability.availableDays.includes(dayOfWeek)) {
        console.log(`Day ${dayOfWeek} is not available for listing ${listingId}`);
        return false;
      }
    }

    // Build query to check for overlapping bookings
    const query = {
      listingId,
      status: { $nin: ['rejected', 'cancelled'] },
      $or: [
        {
          // Booking starts before our period ends and ends after our period starts
          'details.startDate': { $lte: checkEnd },
          'details.endDate': { $gte: checkStart }
        }
      ]
    };

    // Exclude current booking if specified (when checking during acceptance)
    if (excludeBookingId) {
      query._id = { $ne: excludeBookingId };
    }

    // Check for overlapping bookings that are not rejected or cancelled
    const overlappingBookings = await BookingRequest.find(query)
      .select('details.startDate details.endDate details.startTime details.endTime status trackingId');

    // For single day bookings, also check time overlaps
    if (isSingleDay && startTime && endTime && overlappingBookings.length > 0) {
      const timeConflicts = overlappingBookings.filter(booking => {
        // Check if the booking is on the same date
        const bookingStart = new Date(booking.details.startDate);
        const bookingEnd = new Date(booking.details.endDate);
        bookingStart.setHours(0, 0, 0, 0);
        bookingEnd.setHours(0, 0, 0, 0);

        const isSameDay = bookingStart.getTime() === checkStart.getTime() ||
          bookingEnd.getTime() === checkStart.getTime();

        if (isSameDay && booking.details.startTime && booking.details.endTime) {
          return checkTimeOverlap(
            startTime, endTime,
            booking.details.startTime, booking.details.endTime
          );
        }
        return true; // If no time info, assume conflict
      });

      if (timeConflicts.length > 0) {
        console.log('Time conflicts found for listing', listingId + ':');
        timeConflicts.forEach(booking => {
          console.log(`- Booking ${booking.trackingId}: ${booking.details.startTime}-${booking.details.endTime} (${booking.status})`);
        });
        return false;
      }
    } else if (overlappingBookings.length > 0) {
      // For multi-day bookings or bookings without time info, any overlap is a conflict
      console.log('Conflicting bookings found for listing', listingId + ':');
      overlappingBookings.forEach(booking => {
        console.log(`- Booking ${booking.trackingId}: ${booking.details.startDate} to ${booking.details.endDate} (${booking.status})`);
      });
      console.log(`Checking availability for: ${checkStart} to ${checkEnd}${excludeBookingId ? ` (excluding ${excludeBookingId})` : ''}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking availability:', error);
    throw error;
  }
};

module.exports = {
  checkListingAvailability,
  getConflictingBookings,
  calculateDuration,
  calculateBookingPrice,
  calculateFullBookingPrice,
  validateBookingDetails,
  generateTrackingId,
  formatPrice,
  getAvailabilityDetails,
  checkAvailability,
  checkTimeSlotAvailability,
  checkTimeOverlap,
  timeToMinutes,
  getDayOfWeek
};

/**
 * Check that a listing has enough stock before booking
 * @param {string} listingId - Listing ObjectId string
 * @param {number} requiredQty - Quantity required (default 1)
 * @returns {Promise<{ ok: boolean, message?: string, availableQty?: number }>} stock check result
 */
async function checkListingStock(listingId, requiredQty = 1) {
  try {
    if (!listingId) return { ok: false, message: 'Listing ID is required' };
    const qtyNeeded = Number(requiredQty) > 0 ? Number(requiredQty) : 1;
    const listing = await Listing.findById(listingId).select('_id title quantity');
    if (!listing) return { ok: false, message: 'Listing not found' };
    const available = Number(listing.quantity) || 0;
    if (available <= 0) {
      return {
        ok: false, message: {
          en: "The item is out of stock",
          nl: "Het artikel is niet op voorraad."
        }, availableQty: 0
      };
    }
    if (available < qtyNeeded) {
      return { ok: false, message: `Only ${available} in stock`, availableQty: available };
    }
    return { ok: true, availableQty: available };
  } catch (err) {
    console.error('Error checking listing stock:', err);
    return { ok: false, message: 'Failed to check stock' };
  }
}

module.exports.checkListingStock = checkListingStock;

/**
 * Retrieve escrow/upfront payment policy for a listing's subcategory
 * @param {string|object} listing - Listing id or Listing document
 * @returns {Promise<{escrowEnabled:boolean, upfrontFeePercent:number, upfrontHour:number, evenlyoProtectFeePercent:number}>}
 */
async function getListingPaymentPolicy(listing) {
  try {
    let listingDoc = listing;
    if (!listingDoc || (typeof listingDoc === 'string')) {
      listingDoc = await Listing.findById(listing).select('subCategory');
    }
    const subCatId = listingDoc && (listingDoc.subCategory && listingDoc.subCategory._id ? listingDoc.subCategory._id : listingDoc.subCategory);
    if (!subCatId) {
      return { escrowEnabled: false, upfrontFeePercent: 0, upfrontHour: 0, evenlyoProtectFeePercent: 0 };
    }
    const subCat = await SubCategory.findById(subCatId).select('escrowEnabled upfrontFeePercent upfrontHour evenlyoProtectFeePercent');
    if (!subCat) {
      return { escrowEnabled: false, upfrontFeePercent: 0, upfrontHour: 0, evenlyoProtectFeePercent: 0 };
    }
    return {
      escrowEnabled: !!subCat.escrowEnabled,
      upfrontFeePercent: Number(subCat.upfrontFeePercent || 0),
      upfrontHour: Number(subCat.upfrontHour || 0),
      evenlyoProtectFeePercent: Number(subCat.evenlyoProtectFeePercent || 0)
    };
  } catch (err) {
    console.error('Error fetching listing payment policy:', err);
    return { escrowEnabled: false, upfrontFeePercent: 0, upfrontHour: 0, evenlyoProtectFeePercent: 0 };
  }
}

module.exports.getListingPaymentPolicy = getListingPaymentPolicy;
