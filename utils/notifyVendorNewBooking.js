const User = require("../models/User");
const notificationController = require("../controllers/notificationController");
const { resolveVendorOwnerUserId } = require("./resolveVendorUserId");

const notifyVendorNewBooking = async (data) => {
  console.log(data, "i am notification=>>>>>>>");
  await notificationController.sendPushOnly({
    receiverDetails: data.receiverDetails,
    title: data.title,
    message: data.message,
    data: {
      bookingId: data.bookingRequest._id.toString()
    }
  });
}

module.exports = { notifyVendorNewBooking };
