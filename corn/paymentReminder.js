const cron = require("node-cron");
const Booking = require("../models/Booking");
const nodemailer = require("nodemailer");
const moment = require("moment")
const Admin = require("../models/AdminEmployee");
const notificationController = require("../controllers/notificationController");
// const { sendReminderEmail } = require("../utils/mailer");
const StockLog = require("../models/StockLog");
const User = require("../models/User");
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


const sendReminderEmail = async (booking, daysLeft) => {
    console.log(booking.userId.email, "booking.userId.emailbooking.userId.emailbooking.userId.email");

    const remainingAmount =
        ((booking.pricingBreakdown?.total || 0) - (booking.AmountPaid || 0))
            .toFixed(2);

    const eventDateFormatted = moment(booking.details.startDate)
        .format("DD MMM YYYY HH:mm");

    // ⚠ Conditional warning only for 1-day reminder
    const cancellationWarning =
        daysLeft === 1
            ? `
  < div style = "margin-top:20px;padding:15px;background:#fff3cd;border:1px solid #ffeeba;border-radius:6px;" >
          <strong style="color:#856404;">⚠ Important Notice:</strong>
          <p style="margin:8px 0 0 0;color:#856404;">
            If the remaining payment is not completed before the event date and time,
            your booking will be automatically cancelled.
          </p>
        </div >
  `
            : "";

    const emailHtml = `
  <div style = "font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;" >
      <h2 style="color:#333;">Payment Reminder</h2>

      <p>Dear ${booking.userId.firstName},</p>

      <p>
        This is a friendly reminder that your event is in 
        <strong>${daysLeft} day${daysLeft > 1 ? "s" : ""}</strong>.
      </p>

      <p>
        Please complete the remaining payment of 
        <strong>€${remainingAmount}</strong> to ensure your booking remains confirmed.
      </p>

      <h3>Booking Details:</h3>
      <p><strong>Booking ID:</strong> ${booking._id}</p>
      <p><strong>Event Date:</strong> ${eventDateFormatted}</p>
      <p><strong>Service:</strong> ${booking.listingId?.title.en}-- ${booking.listingId?.title?.nl}</p>

      ${cancellationWarning}

      <br/>

      <a href="http://localhost:3000/pay/${booking._id}" 
         style="display:inline-block;margin-top:20px;background:#007bff;color:white;padding:12px 20px;text-decoration:none;border-radius:6px;">
         Pay Now
      </a>

      <p style="margin-top:30px;">
        If you need assistance, please contact our support team.
      </p>

      <p>Warm regards,<br/>Evenlyo Team</p>
    </div >
  `;

    await sendEmail(
        booking.userId.email, // booking.userId.email
        `Your Event is in ${daysLeft} Day${daysLeft > 1 ? "s" : ""} – Payment Reminder`,
        emailHtml
    );
};

const sendVendorCancellationEmail = async (booking, reasonType) => {
    /*
      reasonType:
      "client_cancelled"
      "non_payment"
    */

    const eventDate = moment(booking.details.startDate)
        .format("DD MMM YYYY HH:mm");

    const cancellationReason =
        reasonType === "client_cancelled"
            ? "The client has chosen to cancel this booking."
            : "The booking has been automatically cancelled due to non-payment by the client.";

    const emailHtml = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">

    <h2 style="color:#d9534f;">Booking Cancelled</h2>

    <p>Dear ${booking.vendorId?.firstName || "Vendor"},</p>

    <p>
      We would like to inform you that the following booking has been cancelled.
    </p>

    <div style="margin:20px 0;padding:15px;background:#f8d7da;border:1px solid #f5c6cb;border-radius:6px;">
      <strong>Reason:</strong>
      <p style="margin:8px 0 0 0;">
        ${cancellationReason}
      </p>
    </div>

    <h3>Booking Details:</h3>

    <p><strong>Booking ID:</strong> ${booking._id}</p>
    <p><strong>Event Date:</strong> ${eventDate}</p>
    <p><strong>Service:</strong> ${booking.listingId?.title?.en || "Service Package"}</p>
    <p><strong>Client Name:</strong> ${booking.userId?.firstName || "Client"}</p>

    <br/>

    <p>
      If you have any questions or require further clarification, please contact our support team.
    </p>

    <p>Thank you for being a valued partner.</p>

    <p>Warm regards,<br/>Evenlyo Team</p>

  </div>
  `;

    await sendEmail(
        booking.vendorId.email,
        "Booking Cancellation Notification",
        emailHtml
    );

    const admin = await Admin.findOne({ role: "Admin" }).lean();
    console.log(process.env.EMAIL_USER, "process.env.EMAIL_USERprocess.env.EMAIL_USERprocess.env.EMAIL_USER");

    if (admin && admin.notificationSettings.email.orderCancellation === true) {
        await sendEmail(
            process.env.EMAIL_USER,
            `Admin Alert: Booking ${booking._id} Cancelled`,
            emailHtml
        );
    }

};


// LIVE MODE — run daily at midnight
cron.schedule("*/2 * * * *", async () => {
    console.log("🔄 Cron Job Running: Reminder + Auto Cancel...");
    try {
        const now = moment();
        const today = moment().startOf("day");

        const bookings = await Booking.find({
            paymentStatus: "upfront_paid",
            isFullyPaid: false,
        })
            .populate("userId", "firstName email")
            .populate("listingId", "title")
            .populate("vendorId", "firstName email notifications")
            .lean();
        console.log(bookings[0], "bookingsbookings");
        const vendorDetails = await User.findById(bookings[0].vendorId._id).lean();


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
            if (diffDays === 1 && !booking.reminder1DaysSent) {
                await sendReminderEmail(booking, "1");

                await Booking.findByIdAndUpdate(booking._id, {
                    reminder1DaysSent: true,
                });

                console.log(`📧 1-day reminder sent: ${booking._id}`);
            }

            if (now.isAfter(eventDate) && !booking.isFullyPaid) {
                await Booking.findByIdAndUpdate(booking._id, {
                    status: "cancelled",
                    paymentStatus: "cancelled_due_to_non_payment",
                });

                await StockLog.create({
                    listing: booking.listingId,
                    type: "checkin",
                    quantity: 1,
                    note: `Returned after cancelled booking ${booking._id}`,
                    createdBy: booking.userId,
                });

                if (vendorDetails.notifications.push == true) {
                    await notificationController.createNotification({
                        title: {
                            en: "Booking Cancelled Due to Non-Payment",
                            nl: "Boeking geannuleerd vanwege niet-betalings"
                        },
                        notificationFor: "Vendor",
                        vendorId: booking.vendorId, // vendor's user account receives notification
                        clientId: booking.userId, // 
                        bookingId: booking._id,
                        message: {
                            en: `Booking against ${booking.trackingId} has been cancelled due to non-payment`,
                            nl: `Boeking tegen ${booking.trackingId} is geannuleerd vanwege niet-betaling`
                        }
                    });
                }

                if (vendorDetails.notifications.email == true) {
                    sendVendorCancellationEmail(booking, "non-payment");
                }

                const admin = await Admin.findOne({ role: "Admin" }).lean();

                if (admin && admin.notificationSettings.push.evenlyoProtect === true && booking.pricingBreakdown.paymentPolicy
                    .isEvenlyoProtectEnabled === true) {
                    await notificationController.createNotification({
                        title: {
                            en: "Evenlyo protected booking cancelled Due to Non-Payment",
                            nl: "Evenlyo beschermde boeking geannuleerd vanwege niet-betaling"
                        },
                        notificationFor: "Admin",
                        vendorId: booking.vendorId, // vendor's user account receives notification
                        clientId: booking.userId, // 
                        bookingId: booking._id,
                        message: {
                            en: `A evenlyo protected booking against ${booking.trackingId} has been cancelled due to non-payment`,
                            nl: `Een evenlyo beschermde boeking tegen ${booking.trackingId} is geannuleerd vanwege niet-betaling`
                        }
                    });
                    console.log(`❌ Booking Auto- Cancelled: ${booking._id}`);
                }
            }
        }
    } catch (err) {
        console.error("Cron Error:", err);
    }
});
