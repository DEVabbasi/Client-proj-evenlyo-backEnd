const BookingRequest = require("../models/Booking");
const Listing = require("../models/Listing");
const Settings = require("../models/Settings");
const User = require("../models/User");
const Vendor = require("../models/Vendor");
const {
  checkTimeSlotAvailability,
  getDayOfWeek,
  checkTimeOverlap,
} = require("../utils/bookingUtils");
const SubCategory = require("../models/SubCategory");
const notificationController = require("../controllers/notificationController");
const { createActivityLog } = require("../utils/activityLogger");
// Helper function to calculate day count
function getDayCount(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = end - start;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 for inclusive
}

const createBookingRequest = async (data, session) => {
  const {
    userId,
    listingId,
    vendorId,
    startDate,
    endDate,
    startTime,
    endTime,
    eventLocation,
    eventType,
    guestCount,
    distanceKm,
    specialRequests,
    totalAmount,
    securityFee,
    pricingBreakdown,
  } = data;
  console.log(data, "datadatadatadatadata");

  // Calculate duration and multi-day details early to determine validation
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);
  const diffTime = Math.abs(endDateObj - startDateObj);
  let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  let isMultiDay = diffDays > 1;

  // Validate required fields
  if (!listingId || !vendorId || !startDate || !endDate || !eventLocation) {
    throw new Error("Missing required fields");
  }
  if (!isMultiDay && (!startTime || !endTime)) {
    throw new Error(
      "Start time and end time are required for single-day bookings."
    );
  }

  // Check if listing exists and is active
  const listing = await Listing.findOne({
    _id: listingId,
    isActive: true,
    status: "active",
  })
    .session(session)
    .populate("vendor")
    .populate("category", "name")
    .populate("subCategory", "name");

  if (!listing) {
    throw new Error("Listing not found or not available");
  }

  // Check stock before proceeding (default required quantity = 1, allow override from body.quantity)
  const requestedQty = 1;
  const stock = await checkListingStock(listingId, requestedQty, session);
  if (!stock.ok) {
    throw new Error(stock.message);
  }

  // If listing charges per km, require distanceKm in request details
  if (
    typeof distanceKm === "undefined" ||
    isNaN(Number(distanceKm)) ||
    Number(distanceKm) <= 0
  ) {
    throw new Error(
      `distanceKm is required and must be a positive number for this listing: ${listing?.title?.en || listing?.title?.nl
      }.`
    );
  }

  // Verify vendor matches (guard for missing vendor)
  if (
    !listing.vendor ||
    !listing.vendor._id ||
    listing.vendor._id.toString() !== vendorId
  ) {
    throw new Error(
      `Vendor mismatch for listing: ${listing?.title?.en || listing?.title?.nl
      }.`
    );
  }

  // Check availability for all days in the range, including time slots for single-day bookings
  const isAvailable = await checkAvailability(
    listingId,
    new Date(startDate),
    new Date(endDate),
    null, // excludeBookingId
    startTime, // pass startTime for time slot validation
    endTime, // pass endTime for time slot validation
    session
  );
  // if (!isAvailable) {
  //   throw new Error(
  //     `Selected dates/times are not available. The time slot may be outside available hours or already booked for listing: ${listing?.title?.en || listing?.title?.nl
  //     }.`
  //   );
  // }

  // Calculate hours per day and total hours depending on presence of times and multi-day
  let dailyHours = 0;
  let totalHours = 0;

  const calculateHours = (startTime, endTime) => {
    const startTimeObj = new Date(`2000-01-01 ${startTime}`);
    const endTimeObj = new Date(`2000-01-01 ${endTime}`);
    let diffHours = (endTimeObj - startTimeObj) / (1000 * 60 * 60);
    if (diffHours < 0) diffHours += 24; // Handle overnight
    return Math.max(diffHours, 0);
  };

  if (startTime && endTime) {
    // We have times; compute daily hours and total hours across days
    dailyHours = calculateHours(startTime, endTime);
    totalHours = isMultiDay ? dailyHours * diffDays : dailyHours;
  } else {
    // No times provided. For per-hour pricing assume full days = 24 hours per day
    dailyHours = isMultiDay ? 24 : 0; // if single-day and no times, leave dailyHours 0 but totalHours as 24
    totalHours = diffDays * 24;
  }

  // Fetch platform fee from Settings (with session)
  let settingsQuery = Settings.findOne();
  if (session) {
    settingsQuery = settingsQuery.session(session);
  }
  const settings = await settingsQuery;
  let platformFeePercent = 0.015; // default 1.5%

  if (settings && typeof settings.bookingItemPlatformFee === "number") {
    platformFeePercent = settings.bookingItemPlatformFee;
  }

  // Set securityFees before using it in pricing calculation
  const securityFees = securityFee || 0;

  // Calculate pricing using utility
  const pricingResult = calculateFullBookingPrice(listing, {
    startDate,
    endDate,
    startTime,
    endTime,
    distanceKm,
    totalAmount,
    securityFee: securityFees,
  });

  if (pricingResult && pricingResult.error) {
    throw new Error(pricingResult.error);
  }

  const bookingPrice = pricingResult.bookingPrice;
  const platformFee = data.pricingBreakdown.platformFee
  const extratimeCost = pricingResult.extratimeCost;
  const kmCharge = pricingResult.kmCharge;
  const subtotal = bookingPrice + extratimeCost + securityFees + kmCharge;
  const totalPrice = subtotal + platformFee;
  dailyHours = pricingResult.dailyHours;
  totalHours = pricingResult.totalHours;
  diffDays = pricingResult.diffDays;
  isMultiDay = pricingResult.isMultiDay;

  // Calculate platform fee as percentage of booking price

  // Transform eventType and specialRequests to multilingual format if they are strings
  let processedEventType = eventType;
  let processedSpecialRequests = specialRequests;

  // If eventType is a string, convert to multilingual object
  if (typeof eventType === "string") {
    processedEventType = {
      en: eventType,
      nl: eventType, // Use same value for Dutch, can be translated later
    };
  }

  // If specialRequests is a string, convert to multilingual object
  if (typeof specialRequests === "string") {
    processedSpecialRequests = {
      en: specialRequests,
      nl: specialRequests, // Use same value for Dutch, can be translated later
    };
  }
  // Create booking request with multi-day support

  console.log(listing, "listinglistinglistinglisting");

  const result = getDayCount(startDate, endDate);
  // console.log(result, "RESSASDASDADASD");
  // return
  console.log(data.pricingBreakdown, "pricingBreakdownpricingBreakdownpricingBreakdown");

  const bookingRequest = new BookingRequest({
    orderType: "custom",
    AmountLeft: data?.pricingBreakdown?.total,
    userId: data.userId,
    pricingBreakdown: data.pricingBreakdown,
    userId,
    vendorId,
    status: data.status.toLowerCase(),
    listingId,
    listingDetails: {
      title: listing.title,
      subtitle: listing.subtitle,
      description: listing.description,
      featuredImage:
        listing.images && listing.images.length > 0 ? listing.images[0] : "",
      images: listing.images || [],
      pricing: {
        type: listing.pricing.type,
        amount: totalAmount,
        extratimeCost: listing.pricing.extratimeCost || 0,
        securityFee: securityFees,
        pricePerKm: listing.pricing.pricePerKm || 0,
        days: result,
      },
      category: listing.category
        ? {
          _id: listing.category._id,
          name: listing.category.name,
        }
        : "",
      subCategory: listing.subCategory
        ? {
          _id: listing.subCategory._id,
          name: listing.subCategory.name,
        }
        : "",
      serviceDetails: {
        serviceType: listing.serviceDetails?.serviceType,
      },
      location: {
        fullAddress: listing.location?.fullAddress,
        coordinates: {
          latitude: listing.location?.coordinates?.latitude,
          longitude: listing.location?.coordinates?.longitude,
        },
      },
      contact: {
        phone: listing.contact?.phone,
        email: listing.contact?.email,
        website: listing.contact?.website,
      },
      features: listing.features || [],
      rating: {
        average: listing.rating?.average || 0,
        totalReviews: listing.rating?.totalReviews || 0,
      },
    },
    details: {
      startDate,
      endDate,
      ...(isMultiDay ? {} : { startTime, endTime }),
      duration: {
        hours: dailyHours,
        days: diffDays,
        totalHours: totalHours,
        isMultiDay: isMultiDay,
      },
      eventLocation,
      eventType: processedEventType,
      guestCount,
      specialRequests: processedSpecialRequests,
    },
    pricing: {
      type: listing.pricing.type,
      amount: totalAmount,
      extratimeCost: extratimeCost,
      securityPrice: securityFees,
      extraCharges: 0,
      subtotal: subtotal,
      pricePerKm: listing.pricing.pricePerKm || 0,
      distanceKm: Number(distanceKm) || 0,
      kmCharge: kmCharge,
      bookingPrice: bookingPrice,
      extratimeCostApplied: extratimeCost,
      totalPrice: totalPrice,
      platformFee: platformFee,
      // Optionally add dailyRate for multi-day
      ...(isMultiDay && {
        dailyRate: Math.round(bookingPrice / diffDays),
      }),
    },
    platformFee: data?.pricingBreakdown?.platformFee,
  });

  let resss = null

  // Save with session for transaction support
  if (session) {
    resss = await bookingRequest.save({ session });
  } else {
    resss = await bookingRequest.save();
  }

  console.log(resss, "bookingRequestbookingRequestbookingRequestbookingRequest");

  // Notify vendor of new booking request
  try {
    const vendor = await Vendor.findById(bookingRequest.vendorId);
    const client = await User.findById(bookingRequest.userId).select(
      "firstName lastName"
    );

    console.log(client, "clientclientclientclientclient");


    if (vendor && vendor.userId) {
      const clientName = client
        ? `${client.firstName} ${client.lastName}`
        : "A client";
      const listingTitle = listing.title || "your listing";
      const bookingDates = `${startDate}${endDate !== startDate ? ` to ${endDate}` : ""
        }`;
      await createActivityLog({
        heading: {
          en: "New Booking Request",
          nl: "Nieuwe boekingsaanvraag"
        },
        type: 'booking_created',
        description: {
          en: `New booking request from ${clientName} for "${listingTitle.en}" on ${bookingDates}. Tracking ID: ${bookingRequest.trackingId}`,
          nl: `Nieuwe boekingsaanvraag van ${clientName} voor "${listingTitle.nl}" op ${bookingDates}. Tracking-ID: ${bookingRequest.trackingId}`,
        },
        vendorId: bookingRequest?.vendorId,
        ActivityType: "booking"
      });
      if (vendor.notifications.push === true) {
        await notificationController.createNotification({
          title: {
            en: "New booking request",
            nl: "Nieuwe boekingsaanvraag"
          },
          notificationFor: "Vendor",
          vendorId: vendor?._id, // vendor's user account receives notification
          clientId: null, // vendor's user account receives notification
          bookingId: bookingRequest?._id,
          message: {
            en: `New booking request from ${clientName} for "${listingTitle.en}" on ${bookingDates}. Tracking ID: ${bookingRequest.trackingId}`,
            nl: `Nieuwe boekingsaanvraag van ${clientName} voor "${listingTitle.nl}" op ${bookingDates}. Tracking-ID: ${bookingRequest.trackingId}`,
          },
        });
      }
      if (
        data?.pricingBreakdown?.paymentPolicy
          .isEvenlyoProtectEnabled === true
      ) {
        await notificationController.createNotification({
          title: {
            en: "Evenlyo protected booking",
            nl: "Door Evenlyo beschermde boeking"
          },
          notificationFor: "Admin",
          vendorId: vendor?._id, // vendor's user account receives notification
          clientId: client?._id, // vendor's user account receives notification
          bookingId: bookingRequest?._id,
          message: {
            en: `A evenlyo protected booking request from ${clientName} for "${listingTitle.en}" on ${bookingDates}. Tracking ID: ${bookingRequest.trackingId}`,
            nl: `Een beschermde boekingsaanvraag op Evenlyo van ${clientName} voor "${listingTitle.nl}" op ${bookingDates}. Tracking-ID: ${bookingRequest.trackingId}`,
          },
        });
      }
    }
  } catch (e) {
    console.error("Failed to create vendor notification for new booking:", e);
  }
  // Populate the response (listing details are now stored directly in listingDetails field)
  await bookingRequest.populate([
    { path: "userId", select: "firstName lastName email contactNumber" },
    { path: "vendorId", select: "businessName businessEmail businessPhone" },
  ]);

  // Determine subcategory payment policy (escrow/upfront)
  const policy = await getListingPaymentPolicy(listing, session);
  const upfrontAmount =
    policy.escrowEnabled && policy.upfrontFeePercent > 0
      ? Math.round(((totalPrice * policy.upfrontFeePercent) / 100) * 100) / 100
      : 0;
  const remainingAmount = Math.max(
    Math.round((totalPrice - upfrontAmount) * 100) / 100,
    0
  );

  return bookingRequest;
};

/**
 * Calculate full booking pricing details (booking price, fees, km charge, totals)
 * @param {Object} listing - Listing document
 * @param {Object} opts - { startDate, endDate, startTime, endTime, numberOfEvents, distanceKm }
 * @returns {Object} - pricing breakdown or { error, status }
 */
const calculateFullBookingPrice = (listing, opts = {}) => {
  try {
    const {
      startDate,
      endDate,
      startTime,
      endTime,
      numberOfEvents,
      distanceKm,
      totalAmount,
      securityFee,
    } = opts;

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
    const securityFees = securityFee || 0;

    // validate pricing amount
    console.log(totalAmount, typeof totalAmount, "listing.totalAmount");
    if (!totalAmount || typeof totalAmount !== "number") {
      return { error: "Listing pricing information is invalid.", status: 400 };
    }

    const pricingType = (listing.pricing.type || "").toString().toLowerCase();
    const eventsCount = Number(numberOfEvents) > 0 ? Number(numberOfEvents) : 1;

    let bookingPrice = 0;
    if (
      pricingType === "PerHour" ||
      pricingType === "hourly" ||
      pricingType === "perhour" ||
      pricingType === "per hour"
    ) {
      bookingPrice = totalAmount * totalHours;
    } else if (
      pricingType === "PerDay" ||
      pricingType === "daily" ||
      pricingType === "perday" ||
      pricingType === "per day"
    ) {
      bookingPrice = totalAmount * diffDays;
    } else if (
      pricingType === "PerEvent" ||
      pricingType === "event" ||
      pricingType === "perevent" ||
      pricingType === "per event"
    ) {
      bookingPrice = totalAmount * eventsCount;
    } else if (
      pricingType === "fixed" ||
      pricingType === "fixedprice" ||
      pricingType === "one-time" ||
      pricingType === "fixed price" ||
      pricingType === "one time"
    ) {
      bookingPrice = totalAmount;
    } else {
      return { error: "Unsupported pricing type.", status: 400 };
    }

    // km charge
    let kmCharge = 0;
    if (
      typeof listing.pricing.pricePerKm === "number" &&
      Number(distanceKm) > 0
    ) {
      kmCharge =
        Math.round(listing.pricing.pricePerKm * Number(distanceKm) * 100) / 100;
    }

    // subtotal, system fee and total
    const subtotal = bookingPrice + extratimeCost + securityFees + kmCharge;
    const systemFeePercent = 0.02;
    const systemFee = Math.round(subtotal * systemFeePercent * 100) / 100;
    const totalPrice = Math.round((subtotal + systemFee) * 100) / 100;

    const result = {
      bookingPrice,
      extratimeCost,
      securityFees,
      kmCharge,
      subtotal,
      systemFee,
      systemFeePercent,
      totalPrice,
      dailyHours,
      totalHours,
      diffDays,
      isMultiDay,
      dailyRate: isMultiDay ? Math.round(bookingPrice / diffDays) : null,
    };

    return result;
  } catch (e) {
    console.error("Error calculating booking price:", e);
    return { error: "Failed to calculate booking price", status: 500 };
  }
};

async function checkListingStock(listingId, requiredQty = 1, session) {
  try {
    if (!listingId) return { ok: false, message: "Listing ID is required" };
    const qtyNeeded = Number(requiredQty) > 0 ? Number(requiredQty) : 1;
    const listing = await Listing.findById(listingId)
      .session(session)
      .select("_id title quantity");
    if (!listing) return { ok: false, message: "Listing not found" };
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
      return {
        ok: false,
        message: `Only ${available} in stock`,
        availableQty: available,
      };
    }
    return { ok: true, availableQty: available };
  } catch (err) {
    console.error("Error checking listing stock:", err);
    return { ok: false, message: "Failed to check stock" };
  }
}

// Helper function to check listing availability for multi-day bookings and time slots
const checkAvailability = async (
  listingId,
  startDate,
  endDate,
  excludeBookingId = null,
  startTime = null,
  endTime = null,
  session
) => {
  try {
    // Get listing details to check time slots
    const listing = await Listing.findById(listingId)
      .session(session)
      .select("availability");
    if (!listing) {
      throw new Error(`Listing not found: ${listingId}`);
    }

    // Check if listing is available
    if (!listing.availability?.isAvailable) {
      console.log(
        `Listing ${listing?.title?.en || listing?.title?.nl
        } is marked as unavailable`
      );
      return false;
    }

    // Normalize dates to start of day for accurate comparison
    const checkStart = new Date(startDate);
    checkStart.setHours(0, 0, 0, 0);

    const checkEnd = new Date(endDate);
    checkEnd.setHours(23, 59, 59, 999);

    console.log(checkStart, checkEnd, "checkStartcheckStartcheckStart");

    // Check if it's a single day booking
    const isSingleDay = checkStart.getTime() === checkEnd.setHours(0, 0, 0, 0);

    // For single day bookings, check time availability
    if (
      isSingleDay &&
      startTime &&
      endTime &&
      listing.availability?.availableTimeSlots?.length > 0
    ) {
      const isTimeAvailable = checkTimeSlotAvailability(
        listing.availability.availableTimeSlots,
        startTime,
        endTime
      );

      if (!isTimeAvailable) {
        console.log(
          `Time slot ${startTime}-${endTime} is not available for listing ${listing?.title?.en || listing?.title?.nl
          }`
        );
        return false;
      }
    }

    // Check day of week availability
    if (listing.availability?.availableDays?.length > 0) {
      const dayOfWeek = getDayOfWeek(checkStart);
      if (!listing.availability.availableDays.includes(dayOfWeek)) {
        console.log(
          `Day ${dayOfWeek} is not available for listing ${listing?.title?.en || listing?.title?.nl
          }`
        );
        return false;
      }
    }

    // Build query to check for overlapping bookings
    const query = {
      listingId,
      status: { $nin: ["rejected", "cancelled"] },
      $or: [
        {
          // Booking starts before our period ends and ends after our period starts
          "details.startDate": { $lte: checkEnd },
          "details.endDate": { $gte: checkStart },
        },
      ],
    };

    // Exclude current booking if specified (when checking during acceptance)
    if (excludeBookingId) {
      query._id = { $ne: excludeBookingId };
    }

    // Check for overlapping bookings that are not rejected or cancelled
    const overlappingBookings = await BookingRequest.find(query)
      .session(session)
      .select(
        "details.startDate details.endDate details.startTime details.endTime status trackingId"
      );

    // For single day bookings, also check time overlaps
    if (isSingleDay && startTime && endTime && overlappingBookings.length > 0) {
      const timeConflicts = overlappingBookings.filter((booking) => {
        // Check if the booking is on the same date
        const bookingStart = new Date(booking.details.startDate);
        const bookingEnd = new Date(booking.details.endDate);
        bookingStart.setHours(0, 0, 0, 0);
        bookingEnd.setHours(0, 0, 0, 0);

        const isSameDay =
          bookingStart.getTime() === checkStart.getTime() ||
          bookingEnd.getTime() === checkStart.getTime();

        if (isSameDay && booking.details.startTime && booking.details.endTime) {
          return checkTimeOverlap(
            startTime,
            endTime,
            booking.details.startTime,
            booking.details.endTime
          );
        }
        return true; // If no time info, assume conflict
      });

      if (timeConflicts.length > 0) {
        console.log(
          "Time conflicts found for listing",
          `${listing?.title?.en || listing?.title?.nl}:`
        );
        timeConflicts.forEach((booking) => {
          console.log(
            `- Booking ${booking.trackingId}: ${booking.details.startTime}-${booking.details.endTime} (${booking.status})`
          );
        });
        return false;
      }
    } else if (overlappingBookings.length > 0) {
      // For multi-day bookings or bookings without time info, any overlap is a conflict
      console.log(
        "Conflicting bookings found for listing",
        `${listing?.title?.en || listing?.title?.nl}:`
      );
      overlappingBookings.forEach((booking) => {
        console.log(
          `- Booking ${booking.trackingId}: ${booking.details.startDate} to ${booking.details.endDate} (${booking.status})`
        );
      });
      console.log(
        `Checking availability for: ${checkStart} to ${checkEnd}${excludeBookingId ? ` (excluding ${excludeBookingId})` : ""
        }`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error checking availability:", error);
    throw error;
  }
};

async function getListingPaymentPolicy(listing, session) {
  try {
    let listingDoc = listing;
    if (!listingDoc || typeof listingDoc === "string") {
      listingDoc = await Listing.findById(listing)
        .session(session)
        .select("subCategory");
    }
    const subCatId =
      listingDoc &&
      (listingDoc.subCategory && listingDoc.subCategory._id
        ? listingDoc.subCategory._id
        : listingDoc.subCategory);
    if (!subCatId) {
      return {
        escrowEnabled: false,
        upfrontFeePercent: 0,
        upfrontHour: 0,
        evenlyoProtectFeePercent: 0,
      };
    }
    const subCat = await SubCategory.findById(subCatId)
      .session(session)
      .select(
        "escrowEnabled upfrontFeePercent upfrontHour evenlyoProtectFeePercent"
      );
    if (!subCat) {
      return {
        escrowEnabled: false,
        upfrontFeePercent: 0,
        upfrontHour: 0,
        evenlyoProtectFeePercent: 0,
      };
    }
    return {
      escrowEnabled: !!subCat.escrowEnabled,
      upfrontFeePercent: Number(subCat.upfrontFeePercent || 0),
      upfrontHour: Number(subCat.upfrontHour || 0),
      evenlyoProtectFeePercent: Number(subCat.evenlyoProtectFeePercent || 0),
    };
  } catch (err) {
    console.error("Error fetching listing payment policy:", err);
    return {
      escrowEnabled: false,
      upfrontFeePercent: 0,
      upfrontHour: 0,
      evenlyoProtectFeePercent: 0,
    };
  }
}

module.exports = createBookingRequest;
