// chatbot/tools/getBookingStatus.js
const Booking = require("../../models/Booking");

const STATUS_NOTES = {
  "pending":      "Your booking request is waiting for vendor approval.",
  "accepted":     "Vendor accepted! Please complete payment to confirm.",
  "paid":         "Payment received. The vendor is preparing for your event.",
  "on the way":   "The vendor is on the way to your event! 🚗",
  "on_the_way":   "The vendor is on the way to your event! 🚗",
  "received":     "You've received the item/service.",
  "picked up":    "The vendor has picked the item back up.",
  "picked_up":    "The vendor has picked the item back up.",
  "finished":     "This booking has been finished.",
  "completed":    "Booking complete! Thank you for using Evenlyo. 🎉",
  "cancelled":    "This booking was cancelled.",
  "rejected":     "The vendor rejected this booking request.",
  "claim":        "A complaint/claim has been raised. Admin is reviewing.",
};

const NEXT_ACTION = {
  "pending":    "⏳ Wait for vendor to accept. You can cancel from All Bookings if needed.",
  "accepted":   "💳 Complete your payment now to confirm the booking.",
  "paid":       "✅ All set! Wait for the vendor.",
  "on the way": "📍 Track delivery. Mark as Received once you get it.",
  "received":   "✔️  Mark as Finished once your event is complete.",
  "completed":  "⭐ Leave a review! Go to All Bookings → Add Review.",
  "cancelled":  "ℹ️  Booking is cancelled. You can create a new one if needed.",
  "rejected":   "ℹ️  Vendor rejected this request. Try another vendor!",
  "claim":      "📋 Admin is reviewing your claim. Check email for updates.",
};

async function getBookingStatus({ tracking_id }, context) {
  if (!tracking_id?.trim()) {
    return { error: "Please provide your booking tracking ID. Find it in Profile → All Bookings." };
  }

  const query = { trackingId: tracking_id.trim() };
  if (context?.userId) query.userId = context.userId;

  const booking = await Booking.findOne(query)
    .populate("vendorId", "businessName businessPhone")
    .lean();

  if (!booking) {
    return {
      found:   false,
      message: `No booking found with tracking ID "${tracking_id}". Please double-check. Find your tracking ID in Profile → All Bookings → search field.`,
    };
  }

  const now      = new Date();
  const diffMins = (now - new Date(booking.createdAt)) / (1000 * 60);
  const canCancel = ["pending", "accepted", "paid"].includes(booking.status?.toLowerCase()) && diffMins <= 30;

  const lastUpdate = booking.statusHistory?.length
    ? booking.statusHistory[booking.statusHistory.length - 1]
    : null;

  const statusLower = booking.status?.toLowerCase() || "";

  return {
    found: true,
    booking: {
      trackingId:    booking.trackingId,
      status:        booking.status,
      statusNote:    STATUS_NOTES[statusLower] || booking.status,
      nextAction:    NEXT_ACTION[statusLower]  || null,
      paymentStatus: booking.paymentStatus,
      startDate:     booking.details?.startDate,
      endDate:       booking.details?.endDate,
      startTime:     booking.details?.startTime,
      endTime:       booking.details?.endTime,
      eventLocation: booking.details?.eventLocation,
      listingTitle:
        booking.listingDetails?.title?.en ||
        booking.listingDetails?.title?.nl ||
        "N/A",
      vendorName:  booking.vendorId?.businessName || "N/A",
      vendorPhone: booking.vendorId?.businessPhone || null,
      totalPrice:
        booking.pricingBreakdown?.total ||
        booking.pricing?.totalPrice     ||
        null,
      cancellable:      canCancel,
      cancelWindowNote: canCancel
        ? `⚠️ You can cancel within the next ${Math.max(0, Math.round(30 - diffMins))} minutes.`
        : ["pending","accepted"].includes(statusLower)
          ? "❌ The 30-minute cancellation window has passed."
          : null,
      claimDetails: booking.claimDetails?.reason ? {
        status:    booking.claimDetails.status,
        reason:    booking.claimDetails.reason,
        claimType: booking.claimDetails.claimType,
        claimedAt: booking.claimDetails.claimedAt,
      } : null,
      lastUpdate: lastUpdate ? {
        status:    lastUpdate.status,
        notes:     lastUpdate.notes?.en || lastUpdate.notes,
        timestamp: lastUpdate.timestamp || lastUpdate.updatedAt,
      } : null,
      createdAt: booking.createdAt,
    },
  };
}

module.exports = { getBookingStatus };