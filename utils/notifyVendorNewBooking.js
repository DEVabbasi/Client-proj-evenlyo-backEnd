const User = require("../models/User");
const notificationController = require("../controllers/notificationController");
const { createActivityLog } = require("./activityLogger");
const { resolveVendorOwnerUserId } = require("./resolveVendorUserId");

/**
 * Notify the vendor (listing owner) when a client creates a booking request.
 */
const notifyVendorNewBooking = async ({
  vendorUserId,
  clientUserId,
  bookingRequest,
  listing,
  startDate,
  endDate,
}) => {
  if (!bookingRequest) return;

  const ownerUserId = await resolveVendorOwnerUserId(vendorUserId);
  if (!ownerUserId) {
    console.error("notifyVendorNewBooking: could not resolve vendor owner user", {
      vendorUserId: String(vendorUserId || ""),
      bookingId: String(bookingRequest._id || ""),
    });
    return;
  }

  const client = await User.findById(clientUserId).select("firstName lastName");
  const clientName = client
    ? `${client.firstName} ${client.lastName}`.trim()
    : "A client";
  const listingTitle = listing?.title || {
    en: "your listing",
    nl: "uw aanbod",
  };
  const titleEn =
    typeof listingTitle === "string" ? listingTitle : listingTitle.en || "your listing";
  const titleNl =
    typeof listingTitle === "string" ? listingTitle : listingTitle.nl || "uw aanbod";
  const bookingDates = `${startDate}${
    endDate && endDate !== startDate ? ` to ${endDate}` : ""
  }`;

  const message = {
    en: `New booking request from ${clientName} for "${titleEn}" on ${bookingDates}. Tracking ID: ${bookingRequest.trackingId}`,
    nl: `Nieuwe boekingsaanvraag van ${clientName} voor "${titleNl}" op ${bookingDates}. Tracking-ID: ${bookingRequest.trackingId}`,
  };

  try {
    await createActivityLog({
      heading: {
        en: "New Booking Request",
        nl: "Nieuwe boekingsaanvraag",
      },
      type: "booking_created",
      description: message,
      vendorId: ownerUserId,
      ActivityType: "booking",
    });
  } catch (activityErr) {
    console.error("Activity log failed (booking notification continues):", activityErr);
  }

  const notification = await notificationController.createNotification({
    title: {
      en: "New booking request",
      nl: "Nieuwe boekingsaanvraag",
    },
    notificationFor: "Vendor",
    vendorId: ownerUserId,
    clientId: clientUserId,
    bookingId: bookingRequest._id,
    message,
  });

  if (!notification) {
    console.error("notifyVendorNewBooking: createNotification returned null", {
      ownerUserId: String(ownerUserId),
      bookingId: String(bookingRequest._id),
    });
    await notificationController.sendPushOnly({
      title: {
        en: "New booking request",
        nl: "Nieuwe boekingsaanvraag",
      },
      notificationFor: "Vendor",
      vendorId: ownerUserId,
      message,
      data: {
        bookingId: String(bookingRequest._id),
        type: "booking_created",
      },
    });
  }
};

module.exports = { notifyVendorNewBooking };
