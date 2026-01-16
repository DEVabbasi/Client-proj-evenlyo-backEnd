const cron = require("node-cron");
const Booking = require("../models/Booking");
const nodemailer = require("nodemailer");
const moment = require("moment")
const notificationController = require("../controllers/notificationController");
// Configure your email service
const transporter = nodemailer.createTransport({
    host:process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER, // info@evenlyo.nl
        pass: process.env.EMAIL_PASS  // 12-digit app password
    },
    requireTLS: true
});


async function sendEmail(to, subject, html) {
    try {
        await transporter.sendMail({
            from: `"Evenlyo" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html,
        });
        console.log("Email sent to:", to);
    } catch (err) {
        console.error("Email sending failed:", err);
    }
}


// LIVE MODE — run daily at midnight
cron.schedule("*/1000 * * * *", async () => {
    // console.log("🔄 Cron Job Running: Reminder + Auto Cancel...");

    try {
        const today = moment().startOf("day");

        const bookings = await Booking.find({
            paymentStatus: "upfront_paid",
            isFullyPaid: false,
            reminderSent: false
        })
            .populate("userId", "firstName email")
            .populate("listingId", "title")
            .lean();
        console.log(bookings, "bookingsbookings");

        for (const booking of bookings) {
            console.log(booking, "bookingbookingbookingbooking");

            const eventDate = moment(booking.details.startDate).startOf("day");
            console.log(eventDate, today, "THINGSSS");

            const diffDays = eventDate.diff(today, "days");
            console.log(diffDays, "diffDaysdiffDaysdiffDays");

            // -------------------------------
            // 📩 3 DAYS BEFORE — SEND REMINDER
            // -------------------------------
            if (diffDays === 3) {
                const remainingAmount =
                    (booking.pricingBreakdown?.total || 0) - (booking.AmountPaid || 0);

                const emailHtml = `
          <p>Dear ${booking.userId.firstName},</p>

          <p>We hope you are doing well.</p>

          <p>
            This is a gentle reminder that your scheduled event on Evenlyo is just <strong>3 days away</strong>.<br/>
            To ensure your booking is fully confirmed and all arrangements are prepared on time, please complete the remaining payment of <strong>${remainingAmount}.</strong>.
          </p>

          <h3>Booking Details:</h3>
          <p><strong>Booking ID:</strong> ${booking._id}</p>
          <p><strong>Event Date:</strong> ${moment(booking.details.startDate).format("DD MMM YYYY")}</p>
          <p><strong>Order Details:</strong> ${booking.listingId?.title?.en || "Package"}</p>

          <br/>

          <a href="http://localhost:3000/pay/${booking._id}" 
             style="background:#007bff;color:white;padding:12px 20px;text-decoration:none;border-radius:6px;">
             Pay Now
          </a>

          <br/><br/>
          <p>
            If you need any support, reach out to us anytime through Evenlyo support.
          </p>

          <p>Warm regards,<br/>Evenlyo Team</p>
        `;

                await sendEmail(
                    // booking.userId.email,
                    "sinan.lakhani09@gmail.com",
                    "Your Event is in 3 Days – Payment Reminder",
                    emailHtml
                );

                console.log(`📧 Reminder sent for booking ${booking._id}`);
            }
            await Booking.findByIdAndUpdate(booking._id, { reminderSent: true });
            // -------------------------------
            // ❌ 1 DAY BEFORE — AUTO CANCEL
            // -------------------------------
            if (diffDays === 1) {
                await Booking.findByIdAndUpdate(booking._id, {
                    status: "cancelled",
                    paymentStatus: "cancelled_due_to_non_payment",
                });

                await notificationController.createNotification({
                    notificationFor: "Vendor",
                    vendorId: booking.vendorId, // vendor's user account receives notification
                    clientId: booking.userId, // 
                    bookingId: booking._id,
                    message: `Booking against ${booking.trackingId} has been cancelled due to non-payment`,
                });
                await notificationController.createNotification({
                    notificationFor: "Admin",
                    vendorId: booking.vendorId, // vendor's user account receives notification
                    clientId: booking.userId, // 
                    bookingId: booking._id,
                    message: `Booking against ${booking.trackingId} has been cancelled due to non-payment`,
                });

                console.log(`❌ Booking Auto-Cancelled: ${booking._id}`);
            }
        }
    } catch (err) {
        console.error("Cron Error:", err);
    }
});
