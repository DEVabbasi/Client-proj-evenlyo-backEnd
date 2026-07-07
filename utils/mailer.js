const nodemailer = require("nodemailer");
const moment = require("moment")
const { formatPartyName } = require("./vendorDisplayName");

const Admin = require("../models/AdminEmployee");

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

async function sendOTPEmail(to, otp) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: "Evenlyo - E-mail Verificatie code",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin-bottom: 10px;">Evenlyo</h1>
            <h2 style="color: #666; font-weight: normal;">E-mail Verificatie</h2>
          </div>
          
          <p style="color: #333; font-size: 16px; line-height: 1.5;">
            Bedankt voor je registratie bij Evenlyo! Gebruik de onderstaande verificatiecode om je registratie te voltooien:
          </p>
          
          <div style="text-align:center; margin:30px 0;">
            <div style="background-color:#667eea; color:#ffffff; font-size:32px; font-weight:bold; padding:20px 30px; border-radius:6px; letter-spacing:5px; display:inline-block;">
              ${otp}
            </div>
          </div>
          
          <p style="color: #666; font-size: 14px; line-height: 1.5;">
            Deze code verloopt over 5 minuten om veiligheidsredenen.
          </p>
          
          <p style="color: #666; font-size: 14px; line-height: 1.5;">
            Als je deze verificatiecode niet hebt aangevraagd, kun je deze e-mail negeren.
          </p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center;">
            Dit is een automatisch bericht van Evenlyo. Gelieve niet op deze e-mail te reageren.
          </p>
        </div>
      </div>
    `,
    text: `Je Evenlyo verificatiecode is: ${otp}. Deze code verloopt over 5 minuten.`,
  };

  try {
    return await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error("Error sending OTP email:", err);
    throw err;
  }
}

async function sendForgotOTPADMIN(to, otp) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: "Evenlyo - Wachtwoord Reset",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px;">
          
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333;">Evenlyo</h1>
            <h2 style="color: #666; font-weight: normal;">Wachtwoord Reset</h2>
          </div>

          <p style="color: #333; font-size: 16px; text-align: center;">
            Er is een verzoek gedaan om je wachtwoord te resetten. 
            Gebruik onderstaande OTP-code:
          </p>

          <div style="text-align:center; margin:30px 0;">
            <div style="background-color:#667eea; color:#ffffff; font-size:32px; font-weight:bold; padding:20px 30px; border-radius:6px; letter-spacing:5px; display:inline-block;">
              ${otp}
            </div>
          </div>

          <p style="color:#666; font-size:14px; text-align:center;">
            Deze code verloopt over 5 minuten om veiligheidsredenen.
          </p>

          <p style="color:#666; font-size:14px; text-align:center;">
            Als je dit verzoek niet hebt gedaan, kun je deze e-mail negeren.
          </p>

          <hr style="border:none; border-top:1px solid #eee; margin:30px 0;">

          <p style="color:#999; font-size:12px; text-align:center;">
            Dit is een automatisch bericht van Evenlyo. Gelieve niet op deze e-mail te reageren.
          </p>

        </div>
      </div>
    `,
    text: `Je Evenlyo OTP-code voor het resetten van je wachtwoord is: ${otp}. Deze code verloopt over 5 minuten.`,
  };

  try {
    return await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error("Error sending OTP email:", err);
    throw err;
  }
}

async function sendPromotionalEmail(to, userName) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: "Welkom bij Evenlyo - Ontdek geweldige evenementen!",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin-bottom: 10px;">Welkom bij Evenlyo!</h1>
            <h2 style="color: #666; font-weight: normal;">Jouw reis in evenementenplanning begint hier</h2>
          </div>
          
          <p style="color: #333; font-size: 16px; line-height: 1.5;">Hallo ${userName},</p>
          
          <p style="color: #333; font-size: 16px; line-height: 1.5;">Bedankt voor je betrokkenheid bij onze blog! We stellen je graag voor aan Evenlyo - jouw centrale plek voor al je behoeften op het gebied van evenementenplanning.</p>
          
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 10px; margin: 25px 0; text-align: center;">
            <h3 style="margin: 0 0 15px 0; font-size: 24px;">🎉 Wat wij bieden 🎉</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              <li style="margin: 10px 0; font-size: 16px;">✨ Professionele diensten voor evenementenplanning</li>
              <li style="margin: 10px 0; font-size: 16px;">🎪 Beheer van bruiloften en zakelijke evenementen</li>
              <li style="margin: 10px 0; font-size: 16px;">🎂 Verjaardagsfeesten en speciale gelegenheden</li>
              <li style="margin: 10px 0; font-size: 16px;">📱 Eenvoudig online boekingsplatform</li>
            </ul>
          </div>
          
          <p style="color: #333; font-size: 16px; line-height: 1.5;">Klaar om je volgende geweldige evenement te plannen? Sluit je aan bij duizenden tevreden klanten die Evenlyo vertrouwen voor hun speciale momenten.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || "http://localhost:3000"}/register" 
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 16px; display: inline-block;">
              Word vandaag lid van Evenlyo!
            </a>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <h4 style="color: #333; margin: 0 0 15px 0;">🎁 Speciale aanbieding voor nieuwe leden:</h4>
            <p style="color: #666; margin: 0; font-size: 14px;">Ontvang 20% korting op je eerste evenementenboeking bij registratie binnen de komende 7 dagen!</p>
          </div>
          
          <p style="color: #666; font-size: 14px; line-height: 1.5;">Heb je vragen? Ons vriendelijke team helpt je graag bij het plannen van het perfecte evenement.</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center;">
            Deze e-mail is verzonden omdat je een reactie hebt geplaatst op onze blog. Als je geen promotionele e-mails wilt ontvangen, 
            <a href="${process.env.FRONTEND_URL || "http://localhost:3000"}/unsubscribe" style="color: #999;">klik hier om je af te melden</a>.
          </p>
        </div>
      </div>
    `,
    text: `Hallo ${userName}, Welkom bij Evenlyo! Bedankt voor je betrokkenheid bij onze blog. Wij zijn jouw centrale plek voor evenementenplanning. Word vandaag lid en ontvang 20% korting op je eerste boeking! Ga naar ${process.env.FRONTEND_URL || "http://localhost:3000"}/register om te beginnen.`,
  };

  try {
    return await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error("Error sending promotional email:", err);
    throw err;
  }
}

async function sendContactEmail(fromEmail, fromName, message) {
  const to = process.env.CONTACT_EMAIL || "info@evenlyo.nl";
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    replyTo: fromEmail,
    subject: `Bericht via contactformulier van ${fromName} <${fromEmail}>`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 25px; border-radius: 8px;">
          <h2>Nieuw contactverzoek</h2>
          <p><strong>Van:</strong> ${fromName} &lt;${fromEmail}&gt;</p>
          <hr />
          <div style="white-space: pre-wrap;">${message}</div>
        </div>
      </div>
    `,
    text: `Van: ${fromName} <${fromEmail}>\n\n${message}`,
  };

  try {
    return await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error("Error sending contact email:", err);
    throw err;
  }
}

async function sendReportEmail(to, reportedBy, reportedPerson, reportReason) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: `Nieuwe gebruikersmelding - Gesprek gerapporteerd`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #d32f2f; margin-bottom: 20px;">⚠️ Nieuwe gebruikersmelding</h2>
          <p style="color: #333; font-size: 16px; margin: 10px 0;"><strong>Gerapporteerd door:</strong> ${reportedBy}</p>
          <p style="color: #333; font-size: 16px; margin: 10px 0;"><strong>Gerapporteerde persoon:</strong> ${reportedPerson}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #333; font-size: 16px; margin: 10px 0;"><strong>Reden van melding:</strong></p>
          <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; border-radius: 4px;">
            <p style="color: #333; margin: 0;">${reportReason}</p>
          </div>
          <p style="color: #666; font-size: 14px; margin-top: 20px;">Bekijk deze melding en onderneem passende actie.</p>
        </div>
      </div>
    `,
    text: `Nieuwe gebruikersmelding\n\nGerapporteerd door: ${reportedBy}\nGerapporteerde persoon: ${reportedPerson}\n\nReden van melding: ${reportReason}`,
  };
  try {
    return await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error("Error sending report email:", err);
    throw err;
  }
}

async function sendKvkUpdateEmail(body) {
  console.log(body, "bodybodybodybodybody");

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: "Verzoek om KVK-nummer bij te werken",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; background-color: #f4f6f8;">
        <div style="background-color: #ffffff; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          
          <h2 style="color: #1976d2; margin-bottom: 20px;">
            📄 Verzoek om KVK-nummer bij te werken
          </h2>

          <p style="color: #333; font-size: 16px;">
            Een leverancier heeft verzocht om zijn KVK-nummer bij te werken. Bekijk de onderstaande gegevens.
          </p>

          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />

          <p style="color: #333; font-size: 16px; margin: 8px 0;">
            <strong>Naam leverancier:</strong> ${body.vendorName}
          </p>

          <p style="color: #333; font-size: 16px; margin: 8px 0;">
            <strong>E-mail leverancier:</strong> ${body.vendorEmail}
          </p>

          <p style="color: #333; font-size: 16px; margin: 15px 0;">
            <strong>Beschrijving van verzoek:</strong>
          </p>

          <div style="background-color: #f1f8ff; border-left: 4px solid #1976d2; padding: 15px; border-radius: 4px;">
            <p style="color: #333; margin: 0;">
              ${body.description}
            </p>
          </div>

          <p style="color: #666; font-size: 14px; margin-top: 25px;">
            Controleer het verzoek en werk de KVK-gegevens bij als alles in orde is.
          </p>

        </div>
      </div>
    `,
    text: `
Verzoek om KVK-nummer bij te werken

Naam leverancier: ${body.vendorName}
E-mail leverancier: ${body.vendorEmail}

Beschrijving:
${body.description}

Controleer het verzoek en werk de KVK-gegevens bij als alles in orde is.
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return {
      success: info.accepted && info.accepted.length > 0,
      info, // keep original nodemailer info in case you want it
    };
  } catch (err) {
    console.error("Error sending KVK update email:", err);
    throw err;
  }
}

async function sendOrderStatusEmail({
  customerEmail,
  customerName,
  bookingId,
  status, // "ACCEPTED" | "REJECTED"
  bookingDate,
  bookingTime
}) {

  console.log(customerEmail, customerName, bookingId, status, bookingDate, bookingTime, "EMAIL_DETAILS");

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    requireTLS: true
  });

  // 🎯 Dynamic Content
  let subject = "";
  let heading = "";
  let message = "";
  let color = "";
  let emoji = "";

  if (status === "ACCEPTED") {
    subject = `Boeking geaccepteerd – Boekings-ID: ${bookingId}`;
    heading = "Je boeking is geaccepteerd";
    message = "Goed nieuws! Je boeking is GEACCEPTEERD door de leverancier.";
    color = "#2e7d32";
    emoji = "✅";
  } else if (status === "REJECTED") {
    subject = `Boeking afgewezen – Boekings-ID: ${bookingId}`;
    heading = "Je boeking is afgewezen";
    message = "Helaas is je boeking AFGEWEZEN door de leverancier.";
    color = "#c62828";
    emoji = "❌";
  }

  const mailOptions = {
    from: `<${process.env.EMAIL_USER}>`,
    to: customerEmail,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f6f8;">
        <div style="background-color: #ffffff; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          
          <h2 style="color: ${color};">${emoji} ${heading}</h2>

          <p>Hallo <strong>${customerName}</strong>,</p>
          <p>${message}</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />

          <p><strong>Boekings-ID:</strong> ${bookingId}</p>
          <p><strong>Datum:</strong> ${bookingDate}</p>
          <p><strong>Tijd:</strong> ${bookingTime}</p>

          ${status === "REJECTED"
        ? `<p style="margin-top:15px; color:#c62828;">
                   Je kunt op elk moment een ander beschikbaar tijdslot boeken.
                 </p>`
        : ""
      }

          <p style="margin-top: 20px;">
            Als je vragen hebt, kun je gerust op deze e-mail reageren.
          </p>

          <p style="color: #666; font-size: 14px;">
            Met vriendelijke groet,<br/>Evenlyo Team
          </p>
        </div>
      </div>
    `,
    text: `
Hallo ${customerName},

${message}

Boekings-ID: ${bookingId}
Datum: ${bookingDate}
Tijd: ${bookingTime}

Met vriendelijke groet,
Evenlyo
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Booking status email sent:", info.messageId);
    return info;
  } catch (error) {
    console.error("Error sending booking status email:", error);
    throw error;
  }
}


const sendBookingCompletionEmail = async ({
  customerEmail,
  customerName,
  bookingId,
  bookingDate,
  bookingTime,
  totalAmount,
  listingTitle
}) => {
  // Configure your transporter
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
  // Email options
  const mailOptions = {
    from: `<${process.env.EMAIL_USER}>`,
    to: customerEmail,
    subject: `Boeking voltooid – Boekings-ID: ${bookingId}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f6f8;">
        <div style="background-color: #ffffff; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #388e3c;">✅ Je boeking is voltooid</h2>
          <p>Hallo <strong>${customerName}</strong>,</p>
          <p>We zijn verheugd je te kunnen meedelen dat je boeking voor <strong>${listingTitle}</strong> succesvol is voltooid.</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />

          <p><strong>Boekings-ID:</strong> ${bookingId}</p>
          <p><strong>Datum:</strong> ${bookingDate}</p>
          <p><strong>Tijd:</strong> ${bookingTime}</p>
          <p><strong>Totaalbedrag:</strong> €${totalAmount}</p>

          <p style="margin-top: 20px;">Bedankt dat je gebruik hebt gemaakt van onze diensten. We hopen dat je een geweldige ervaring hebt gehad!</p>

          <p style="color: #666; font-size: 14px;">Met vriendelijke groet,<br/>Evenlyo Team</p>
        </div>
      </div>
    `,
    text: `
Hallo ${customerName},

We zijn verheugd je te kunnen meedelen dat je boeking voor ${listingTitle} succesvol is voltooid.

Boekings-ID: ${bookingId}
Datum: ${bookingDate}
Tijd: ${bookingTime}
Totaalbedrag: €${totalAmount}

Bedankt dat je gebruik hebt gemaakt van onze diensten. We hopen dat je een geweldige ervaring hebt gehad!

Met vriendelijke groet,
Evenlyo
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Booking completion email sent:", info.messageId);
    return info;
  } catch (error) {
    console.error("Error sending booking completion email:", error);
    throw error;
  }
};

const sendVendorCancellationEmail = async (booking, reasonType = "non-payment") => {
  const eventDate = booking?.details?.startDate
    ? moment(booking.details.startDate).format("DD MMM YYYY")
    : "N/A";

  const cancellationReason =
    reasonType === "client_cancelled"
      ? "De klant heeft deze boeking geannuleerd."
      : "De boeking is automatisch geannuleerd wegens niet-betaling door de klant.";

  const mailOptions = {
    from: `"Evenlyo" <${process.env.EMAIL_USER}>`,
    to: booking?.vendorId?.email,
    subject: "Kennisgeving: Boeking Geannuleerd",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
        <h2>Boeking Geannuleerd</h2>
        <p>Hallo ${booking?.vendorId?.firstName || "Leverancier"},</p>
        <p>${cancellationReason}</p>
        <p><strong>Tracking ID:</strong> ${booking?.trackingId || "N/A"}</p>
        <p><strong>Datum:</strong> ${eventDate}</p>
        <p><strong>Dienst:</strong> ${booking?.listingId?.title?.nl || booking?.listingId?.title?.en || "Service Pakket"}</p>
        <p><strong>Klant:</strong> ${booking?.userId?.firstName || "Klant"}</p>
        <p style="margin-top:20px;">Met vriendelijke groet,<br/>Evenlyo Team</p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
};

const sendEvenlyoProtectBookingEmail = async (booking, client, vendor, status, adminEmail) => {
  const clientName = formatPartyName(client);
  const vendorName = formatPartyName(vendor);

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    requireTLS: true
  });

  // 🎯 Dynamische waarden op basis van status
  let subject = "";
  let heading = "";
  let statusMessage = "";
  let headingColor = "#2c3e50";

  switch (status) {
    case "ACCEPTED":
      subject = "Evenlyo Protect boeking geaccepteerd door leverancier";
      heading = "Boeking geaccepteerd ✅";
      statusMessage = "De leverancier heeft deze Evenlyo Protect boeking GEACCEPTEERD.";
      headingColor = "#27ae60";
      break;

    case "REJECTED":
      subject = "Evenlyo Protect boeking afgewezen door leverancier";
      heading = "Boeking afgewezen ❌";
      statusMessage = "De leverancier heeft deze Evenlyo Protect boeking AFGEWEZEN.";
      headingColor = "#e74c3c";
      break;

    case "RECEIVED":
      subject = "Evenlyo Protect boeking ontvangen door klant";
      heading = "Boeking ontvangen door klant";
      statusMessage = "De klant heeft bevestigd dat deze Evenlyo Protect boeking is ontvangen.";
      headingColor = "#2980b9";
      break;

    default:
      subject = "Nieuwe Evenlyo Protect boeking ontvangen";
      heading = "Nieuwe Evenlyo Protect boeking";
      statusMessage = "Er is een nieuwe boeking geplaatst met Evenlyo Protect ingeschakeld.";
      headingColor = "#2c3e50";
  }

  const mailOptions = {
    from: `"Evenlyo" <${process.env.EMAIL_USER}>`,
    to: adminEmail || process.env.EMAIL_USER,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9f9f9;">
        <div style="max-width: 600px; margin: auto; background: #ffffff; padding: 20px; border-radius: 8px;">
          
          <h2 style="color: ${headingColor};">${heading}</h2>
          
          <p>Hallo Admin,</p>

          <p>${statusMessage}</p>

          <hr />

          <p><strong>Boekings-ID:</strong> ${booking.trackingId}</p>
          <p><strong>Klantnaam:</strong> ${clientName}</p>
          <p><strong>Leveranciersnaam:</strong> ${vendorName}</p>
          <p><strong>Dienst:</strong> ${booking.listingDetails?.title?.en} -- ${booking.listingDetails?.title?.nl}</p>
          <p><strong>Totaalbedrag:</strong> €${booking.pricingBreakdown?.total || 0}</p>
          <p><strong>Boekingsdatum:</strong> ${booking.details?.startDate || "N/A"}</p>

          <hr />

          <p style="margin-top: 20px;">
            Bekijk deze boeking in het admin dashboard.
          </p>

          <p style="color: #888; font-size: 12px; margin-top: 30px;">
            Dit is een automatische melding van het Evenlyo systeem.
          </p>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Evenlyo Protect boeking e-mail verzonden naar admins - Status: ${status}`);
  } catch (error) {
    console.error("Fout bij het verzenden van Evenlyo Protect boeking e-mail:", error);
  }
};

const sendReminderEmail = async (booking, daysLeft) => {
  const remainingAmount =
    (booking.pricingBreakdown?.total || 0) - (booking.AmountPaid || 0);

  const eventDateFormatted = moment(booking.details.startDate)
    .format("DD MMM YYYY HH:mm");

  // ⚠ Conditional warning only for 1-day reminder
  const cancellationWarning =
    daysLeft === 1
      ? `
  < div style = "margin-top:20px;padding:15px;background:#fff3cd;border:1px solid #ffeeba;border-radius:6px;" >
          <strong style="color:#856404;">⚠ Belangrijke mededeling:</strong>
          <p style="margin:8px 0 0 0;color:#856404;">
            Als de resterende betaling niet vóór de datum en tijd van het evenement is voltooid,
            wordt je boeking automatisch geannuleerd.
          </p>
        </div >
  `
      : "";

  const emailHtml = `
  < div style = "font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;" >
      <h2 style="color:#333;">Betalingsherinnering</h2>

      <p>Beste ${booking.userId.firstName},</p>

      <p>
        Dit is een vriendelijke herinnering dat je evenement over 
        <strong>${daysLeft} dag${daysLeft > 1 ? "en" : ""}</strong> plaatsvindt.
      </p>

      <p>
        Voltooi de resterende betaling van 
        <strong>€${remainingAmount}</strong> om ervoor te zorgen dat je boeking bevestigd blijft.
      </p>

      <h3>Boekingsdetails:</h3>
      <p><strong>Boekings-ID:</strong> ${booking._id}</p>
      <p><strong>Evenementdatum:</strong> ${eventDateFormatted}</p>
      <p><strong>Dienst:</strong> ${booking.listingId?.title || "Pakket"}</p>

      ${cancellationWarning}

      <br/>

      <a href="${process.env.NODE_ENV === 'development' ? process.env.STAGING_CLIENT_URL : process.env.LIVE_CLIENT_URL}/pay/${booking._id}" 
         style="display:inline-block;margin-top:20px;background:#007bff;color:white;padding:12px 20px;text-decoration:none;border-radius:6px;">
         Nu betalen
      </a>

      <p style="margin-top:30px;">
        Als je hulp nodig hebt, neem dan contact op met ons ondersteuningsteam.
      </p>

      <p>Met vriendelijke groet,<br/>Evenlyo Team</p>
    </div >
  `;

  await sendEmail(
    booking.userId.email,
    `Je evenement is over ${daysLeft} dag${daysLeft > 1 ? "en" : ""} – Betalingsherinnering`,
    emailHtml
  );
};

const sendEmail = async (to, subject, html) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,      // 587 or 465
      secure: false,                      // true if port 465
      auth: {
        user: process.env.EMAIL_USER,     // your email
        pass: process.env.EMAIL_PASS   // app password
      }
    });
    const mailOptions = {
      from: `"Evenlyo" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    };

    const info = await transporter.sendMail(mailOptions);

    console.log("📧 Email sent:", info.messageId);
    return true;

  } catch (error) {
    console.error("❌ Email sending failed:", error);
    return false;
  }
};

async function sendChatbotTicketReply({ toEmail, toName, subject, userMessage, adminReply, ticketId }) {
  const mailOptions = {
    from: `"Evenlyo Support" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `Re: ${subject} — Ticket #${ticketId}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">

          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="margin: 0; font-size: 22px; color: #e91e8c;">Evenlyo Support</h1>
            <p style="color: #888; font-size: 13px; margin-top: 4px;">Ticket #${ticketId}</p>
          </div>

          <p style="color: #333; font-size: 15px;">Hallo <strong>${toName}</strong>,</p>
          <p style="color: #333; font-size: 15px; line-height: 1.6;">
            Bedankt dat je contact hebt opgenomen met Evenlyo Support. Hier is ons antwoord op je vraag:
          </p>

          <div style="background: #f3f4f6; border-left: 4px solid #e91e8c; padding: 16px 20px; border-radius: 6px; margin: 20px 0;">
            <p style="color: #111; font-size: 14px; line-height: 1.7; margin: 0;">${adminReply}</p>
          </div>

          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />

          <p style="color: #999; font-size: 12px; margin-bottom: 4px;"><strong>Je oorspronkelijke bericht:</strong></p>
          <p style="color: #aaa; font-size: 12px; font-style: italic; line-height: 1.6;">${userMessage}</p>

          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />

          <p style="color: #666; font-size: 13px; text-align: center;">
            Als je nog vragen hebt, neem dan gerust opnieuw contact met ons op via de Evenlyo-chatbot of de ondersteuningspagina.
          </p>

          <p style="color: #999; font-size: 11px; text-align: center; margin-top: 20px;">
            Dit is een automatisch antwoord van Evenlyo. Reageer niet rechtstreeks op deze e-mail.
          </p>
        </div>
      </div>
    `,
    text: `Hallo ${toName},\n\nBedankt dat je contact hebt opgenomen met Evenlyo Support (Ticket #${ticketId}).\n\nOns antwoord:\n${adminReply}\n\nJe oorspronkelijke bericht:\n${userMessage}\n\nMet vriendelijke groet,\nEvenlyo Support Team`,
  };

  return transporter.sendMail(mailOptions);
}

const sendSecurityRefundEmail = async ({ email, name, booking, amount }) => {
  const subject = "Uw waarborgsom is terugbetaald";

  const html = `
    <div style="font-family: Arial, sans-serif; font-size:15px; color:#333;">
      <h2>Uw waarborgsom is terugbetaald</h2>

      <p>Beste ${name},</p>

      <p>Goed nieuws! De waarborgsom voor uw boeking is succesvol terugbetaald.</p>

      <table style="border-collapse:collapse;margin-top:15px;">
        <tr>
          <td style="padding:6px 12px;"><strong>Trackingnummer:</strong></td>
          <td>${booking.trackingId}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px;"><strong>Terugbetaald bedrag:</strong></td>
          <td>€${Number(amount).toFixed(2)}</td>
        </tr>
      </table>

 

      <p>Bedankt voor het gebruik van Evenlyo.</p>

      <br>

      <p>
        Met vriendelijke groet,<br>
        <strong>Team Evenlyo</strong>
      </p>
    </div>
  `;

  await sendEmail(email, subject, html);
};

const sendClientClaimRefundEmail = async ({
  email,
  name,
  booking,
  amount,
}) => {
  const subject = "Uw claim is goedgekeurd";

  const html = `
    <div style="font-family: Arial, sans-serif; font-size:15px; color:#333;">
      <h2>Uw claim is goedgekeurd</h2>

      <p>Beste ${name},</p>

      <p>
        Uw claim is beoordeeld en goedgekeurd door onze administratie.
        Het onderstaande bedrag is inmiddels terugbetaald.
      </p>

      <table style="border-collapse:collapse;margin-top:15px;">
        <tr>
          <td style="padding:6px 12px;"><strong>Trackingnummer:</strong></td>
          <td>${booking.trackingId}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px;"><strong>Terugbetaald bedrag:</strong></td>
          <td>€${Number(amount).toFixed(2)}</td>
        </tr>
      </table>


      <p>Bedankt voor uw geduld.</p>

      <br>

      <p>
        Met vriendelijke groet,<br>
        <strong>Team Evenlyo</strong>
      </p>
    </div>
  `;

  await sendEmail(email, subject, html);
};



module.exports = {
  sendOTPEmail,
  sendPromotionalEmail,
  sendContactEmail,
  sendReportEmail,
  sendForgotOTPADMIN,
  sendKvkUpdateEmail,
  sendOrderStatusEmail,
  sendBookingCompletionEmail,
  sendVendorCancellationEmail,
  sendReminderEmail,
  sendEvenlyoProtectBookingEmail,
  sendChatbotTicketReply,
  sendSecurityRefundEmail,
  sendClientClaimRefundEmail,
};
