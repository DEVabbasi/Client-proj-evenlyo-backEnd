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
    const remainingAmount =
        ((booking.pricingBreakdown?.total || 0) - (booking.AmountPaid || 0)).toFixed(2);

    const eventDateFormatted = moment(booking.details.startDate)
        .format("DD MMM YYYY HH:mm");

    const cancellationWarning =
        daysLeft === 1
            ? `
    <div style="margin-top:20px;padding:15px;background:#fff3cd;border:1px solid #ffeeba;border-radius:6px;">
      <strong style="color:#856404;">⚠ Belangrijk bericht:</strong>
      <p style="margin:8px 0 0 0;color:#856404;">
        Indien het resterende bedrag niet vóór de evenementdatum wordt betaald,
        wordt uw boeking automatisch geannuleerd.
      </p>
    </div>
  `
            : "";

    const emailHtml = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
      
      <h2 style="color:#333;">Betalingsherinnering</h2>

      <p>Beste ${booking.userId.firstName},</p>

      <p>
        Dit is een vriendelijke herinnering dat uw evenement over 
        <strong>${daysLeft} dag${daysLeft > 1 ? "en" : ""}</strong> plaatsvindt.
      </p>

      <p>
        Gelieve het resterende bedrag van 
        <strong>€${remainingAmount}</strong> te betalen om uw boeking bevestigd te houden.
      </p>

      <h3>Boekingsdetails:</h3>
      <p><strong>Boekings-ID:</strong> ${booking._id}</p>
      <p><strong>Evenementdatum:</strong> ${eventDateFormatted}</p>
      <p><strong>Service:</strong> ${booking.listingId?.title.en} - ${booking.listingId?.title?.nl}</p>

      ${cancellationWarning}

      <br/>

      <a href="https://staging.evenlyo.nl/pay/${booking._id}"
         style="display:inline-block;margin-top:20px;background:#007bff;color:white;padding:12px 20px;text-decoration:none;border-radius:6px;">
         Nu Betalen
      </a>

      <p style="margin-top:30px;">
        Indien u hulp nodig heeft, neem gerust contact op met onze support.
      </p>

      <p>Met vriendelijke groet,<br/>Evenlyo Team</p>
    </div>
  `;

    await sendEmail(
        booking.userId.email,
        `Uw evenement is over ${daysLeft} dag(en) – Betalingsherinnering`,
        emailHtml
    );
};

const sendAdminCancellationEmail = async (booking) => {

    const eventDate = moment(booking.details.startDate).format("DD MMM YYYY");

    const emailHtml = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">

    <h2>Admin Alert: Boeking Geannuleerd</h2>

    <p>Een boeking is geannuleerd wegens niet-betaling.</p>

    <p><strong>Boeking ID:</strong> ${booking._id}</p>
    <p><strong>Tracking ID:</strong> ${booking.trackingId}</p>
    <p><strong>Datum:</strong> ${eventDate}</p>
    <p><strong>Klant:</strong> ${booking.userId?.firstName}</p>
    <p><strong>Leverancier:</strong> ${booking.vendorId?.firstName}</p>

    <p style="margin-top:20px;">Systeem melding Evenlyo</p>

  </div>
  `;

    await sendEmail(
        process.env.EMAIL_USER,
        `Admin: Boeking ${booking.trackingId} geannuleerd`,
        emailHtml
    );
};

const sendVendorCancellationEmail = async (booking, reasonType) => {

    const eventDate = moment(booking.details.startDate).format("DD MMM YYYY");

    const cancellationReason =
        reasonType === "client_cancelled"
            ? "De klant heeft deze boeking geannuleerd."
            : "De boeking is automatisch geannuleerd wegens niet-betaling door de klant.";

    const emailHtml = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">

    <h2 style="color:#d9534f;">Boeking Geannuleerd</h2>

    <p>Beste ${booking.vendorId?.firstName || "Leverancier"},</p>

    <p>
      Wij willen u informeren dat de volgende boeking is geannuleerd.
    </p>

    <div style="margin:20px 0;padding:15px;background:#f8d7da;border:1px solid #f5c6cb;border-radius:6px;">
      <strong>Reden:</strong>
      <p style="margin:8px 0 0 0;">
        ${cancellationReason}
      </p>
    </div>

    <h3>Boekingsdetails:</h3>

    <p><strong>Boekings-ID:</strong> ${booking._id}</p>
    <p><strong>Evenementdatum:</strong> ${eventDate}</p>
    <p><strong>Service:</strong> ${booking.listingId?.title?.nl || "Service Pakket"}</p>
    <p><strong>Klant:</strong> ${booking.userId?.firstName || "Klant"}</p>

    <br/>

    <p>
      Indien u vragen heeft, neem gerust contact op met ons supportteam.
    </p>

    <p>Bedankt voor uw samenwerking.</p>

    <p>Met vriendelijke groet,<br/>Evenlyo Team</p>

  </div>
  `;

    await sendEmail(
        booking.vendorId.email,
        "Kennisgeving: Boeking Geannuleerd",
        emailHtml
    );

    const admin = await Admin.findOne({ role: "Admin" }).lean();

    if (admin && admin.notificationSettings.email.orderCancellation === true) {
        await sendEmail(
            process.env.EMAIL_USER,
            `Admin melding: Boeking ${booking._id} geannuleerd`,
            emailHtml
        );
    }
};

// LIVE MODE — run daily at midnight
cron.schedule("*/30 * * * *", async () => {
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

        console.log(bookings.length, "total bookings found");

        for (const booking of bookings) {

            if (!booking?.details?.startDate) continue;

            const eventDate = moment(booking.details.startDate).startOf("day");
            const diffDays = eventDate.diff(today, "days");
            console.log(booking, "bookingbookingbookingbooking");

            const vendorDetails = booking.vendorId; // ✅ FIXED (already populated)
            console.log(vendorDetails, "vendorDetailsvendorDetailsvendorDetailsvendorDetails");

            // -------------------------------
            // 📩 3 DAYS REMINDER
            // -------------------------------
            if (diffDays === 3 && !booking.reminder3DaysSent) {
                await sendReminderEmail(booking, "3");

                await Booking.findByIdAndUpdate(booking._id, {
                    reminder3DaysSent: true,
                });

                console.log(`📧 3-day reminder sent: ${booking._id}`);
            }

            // -------------------------------
            // 📩 1 DAY REMINDER OHH
            // -------------------------------
            if (diffDays === 1 && !booking.reminder1DaysSent) {
                await sendReminderEmail(booking, "1");

                await Booking.findByIdAndUpdate(booking._id, {
                    reminder1DaysSent: true,
                });

                console.log(`📧 1-day reminder sent: ${booking._id}`);
            }

            // -------------------------------
            // ❌ AUTO CANCEL AFTER EVENT
            // -------------------------------
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

                // ---------------- PUSH NOTIFICATION
                if (vendorDetails?.notifications?.push) {
                    await notificationController.createNotification({
                        title: {
                            en: "Booking Cancelled Due to Non-Payment",
                            nl: "Boeking geannuleerd vanwege niet-betaling"
                        },
                        notificationFor: "Vendor",
                        vendorId: booking.vendorId._id,
                        clientId: booking.userId._id,
                        bookingId: booking._id,
                        message: {
                            en: `Booking ${booking.trackingId} cancelled due to non-payment`,
                            nl: `Boeking ${booking.trackingId} is geannuleerd wegens niet-betaling`
                        }
                    });
                }
                console.log(vendorDetails, 'vendorDetails?.notifications?vendorDetails?.notifications?');

                // ---------------- EMAIL NOTIFICATION
                if (vendorDetails?.notifications?.email) {
                    await sendVendorCancellationEmail(booking, "non-payment");
                }
                const admin = await Admin.findOne({ role: "Admin" }).lean();
                console.log(admin, "adminadminadmin");

                if (admin?.notificationSettings?.email?.orderCancellation) {
                    await sendAdminCancellationEmail(booking);
                }

                console.log(`❌ Booking Auto-Cancelled: ${booking._id}`);
            }
        }

    } catch (err) {
        console.error("Cron Error:", err);
    }
});
