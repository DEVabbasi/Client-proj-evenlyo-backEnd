const notificationController = require("../controllers/notificationController");

const pickBestText = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.en || value.nl || "";
};

const notifyVendorNewBooking = async (data) => {
  const bookingId = data.bookingRequest?._id;

  try {
    await notificationController.sendPushOnly({
      receiverDetails: data.receiverDetails,
      title: pickBestText(data.title),
      message: pickBestText(data.message),
      data: {
        bookingId: bookingId?.toString() || "",
      },
    });
  } catch (e) {
    console.error("Failed to send vendor push notification:", e);
  }
};

module.exports = { notifyVendorNewBooking };