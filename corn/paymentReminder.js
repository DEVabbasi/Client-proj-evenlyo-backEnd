const cron = require("node-cron");
const Booking = require("../models/Booking");
const nodemailer = require("nodemailer");
const moment = require("moment")
const notificationController = require("../controllers/notificationController");
const { sendReminderEmail } = require("../utils/mailer");
// Configure your email service
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
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
cron.schedule("0 */5 * * *", async () => {
    // console.log("🔄 Cron Job Running: Reminder + Auto Cancel...");

    try {
        const now = moment();
        const today = moment().startOf("day");

        const bookings = await Booking.find({
            paymentStatus: "upfront_paid",
            isFullyPaid: false,
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
            if (diffDays === 3 && !booking.reminder3DaysSent) {
                await sendReminderEmail(booking, "3");
                await Booking.findByIdAndUpdate(booking._id, {
                    reminder3DaysSent: true,
                });

                console.log(`📧 3-day reminder sent: ${booking._id}`);
            }
            // -------------------------------
            // ❌ 1 DAY BEFORE — AUTO CANCEL
            // -------------------------------

            // ----------------------------------
            // 📩 1 DAY BEFORE REMINDER
            // ----------------------------------
            if (diffDays === 1 && !booking.reminder1DaySent) {
                await sendReminderEmail(booking, "1");

                await Booking.findByIdAndUpdate(booking._id, {
                    reminder1DaySent: true,
                });

                console.log(`📧 1-day reminder sent: ${booking._id}`);
            }

            if (now.isAfter(eventDate) && !booking.isFullyPaid) {
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
