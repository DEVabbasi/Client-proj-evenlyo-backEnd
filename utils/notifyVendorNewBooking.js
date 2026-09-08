const notificationController = require("../controllers/notificationController");

const pickBestText = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.nl || value.en || "";
};

const toBilingual = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value === "string") {
    return { en: value, nl: value };
  }
  return value;
};

const notifyVendorNewBooking = async (data) => {
  const listingTitle = data.listing?.title || {
    en: "your listing",
    nl: "uw aanbod",
  };

  const title = toBilingual(data.title, {
    en: "New Booking Request",
    nl: "Nieuwe boekingsaanvraag",
  });

  const message = toBilingual(data.message, {
    en: `New booking request for "${listingTitle.en}"`,
    nl: `Nieuwe boekingsaanvraag voor "${listingTitle.nl}"`,
  });

  const vendorId = data.receiverDetails?._id || data.vendorId;
  const bookingId = data.bookingRequest?._id;

  try {
    await notificationController.createNotification({
      title,
      message,
      notificationFor: "Vendor",
      vendorId,
      clientId: data.bookingRequest?.userId,
      bookingId,
    });
  } catch (e) {
    console.error("Failed to create vendor in-app notification:", e);
  }

  try {
    await notificationController.sendPushOnly({
      receiverDetails: data.receiverDetails,
      title: pickBestText(title),
      message: pickBestText(message),
      data: {
        bookingId: bookingId?.toString() || "",
      },
    });
  } catch (e) {
    console.error("Failed to send vendor push notification:", e);
  }
};

module.exports = { notifyVendorNewBooking };