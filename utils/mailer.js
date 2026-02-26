const nodemailer = require("nodemailer");

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
    subject: "Evenlyo - Email Verification Code",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin-bottom: 10px;">Evenlyo</h1>
            <h2 style="color: #666; font-weight: normal;">Email Verification</h2>
          </div>
          
          <p style="color: #333; font-size: 16px; line-height: 1.5;">Thank you for registering with Evenlyo! To complete your registration, please use the verification code below:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-size: 32px; font-weight: bold; padding: 20px; border-radius: 10px; letter-spacing: 5px; display: inline-block;">
              ${otp}
            </div>
          </div>
          
          <p style="color: #666; font-size: 14px; line-height: 1.5;">This code will expire in 5 minutes for security reasons.</p>
          
          <p style="color: #666; font-size: 14px; line-height: 1.5;">If you didn't request this verification code, please ignore this email.</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message from Evenlyo. Please do not reply to this email.</p>
        </div>
      </div>
    `,
    text: `Your Evenlyo verification code is: ${otp}. This code will expire in 5 minutes.`,
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
    subject: "Evenlyo - Reset Password",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin-bottom: 10px;">Evenlyo</h1>
            <h2 style="color: #666; font-weight: normal;">Email Verification</h2>
          </div>
          
        <p style="color: #333; font-size: 16px; line-height: 1.5; text-align: center;">
  Reset Password Requested. Below is the OTP
</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-size: 32px; font-weight: bold; padding: 20px; border-radius: 10px; letter-spacing: 5px; display: inline-block;">
              ${otp}
            </div>
          </div>
          
          <p style="color: #666; font-size: 14px; line-height: 1.5;">This code will expire in 5 minutes for security reasons.</p>
          
          <p style="color: #666; font-size: 14px; line-height: 1.5;">If you didn't request this verification code, please ignore this email.</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message from Evenlyo. Please do not reply to this email.</p>
        </div>
      </div>
    `,
    text: `Your Evenlyo verification code is: ${otp}. This code will expire in 5 minutes.`,
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
    subject: "Welcome to Evenlyo - Discover Amazing Events!",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin-bottom: 10px;">Welcome to Evenlyo!</h1>
            <h2 style="color: #666; font-weight: normal;">Your Event Planning Journey Starts Here</h2>
          </div>
          
          <p style="color: #333; font-size: 16px; line-height: 1.5;">Hi ${userName},</p>
          
          <p style="color: #333; font-size: 16px; line-height: 1.5;">Thank you for engaging with our blog! We're excited to introduce you to Evenlyo - your one-stop destination for all event planning needs.</p>
          
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 10px; margin: 25px 0; text-align: center;">
            <h3 style="margin: 0 0 15px 0; font-size: 24px;">🎉 What We Offer 🎉</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              <li style="margin: 10px 0; font-size: 16px;">✨ Professional Event Planning Services</li>
              <li style="margin: 10px 0; font-size: 16px;">🎪 Wedding & Corporate Event Management</li>
              <li style="margin: 10px 0; font-size: 16px;">🎂 Birthday Parties & Special Occasions</li>
              <li style="margin: 10px 0; font-size: 16px;">📱 Easy Online Booking Platform</li>
            </ul>
          </div>
          
          <p style="color: #333; font-size: 16px; line-height: 1.5;">Ready to plan your next amazing event? Join thousands of satisfied customers who trust Evenlyo for their special moments.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || "http://localhost:3000"
      }/register" 
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 16px; display: inline-block;">
              Join Evenlyo Today!
            </a>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <h4 style="color: #333; margin: 0 0 15px 0;">🎁 Special Offer for New Members:</h4>
            <p style="color: #666; margin: 0; font-size: 14px;">Get 20% off your first event booking when you register within the next 7 days!</p>
          </div>
          
          <p style="color: #666; font-size: 14px; line-height: 1.5;">Have questions? Our friendly team is here to help you plan the perfect event.</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center;">
            This email was sent because you commented on our blog. If you don't want to receive promotional emails, 
            <a href="${process.env.FRONTEND_URL || "http://localhost:3000"
      }/unsubscribe" style="color: #999;">click here to unsubscribe</a>.
          </p>
        </div>
      </div>
    `,
    text: `Hi ${userName}, Welcome to Evenlyo! Thank you for engaging with our blog. We're your one-stop destination for event planning. Join us today and get 20% off your first booking! Visit ${process.env.FRONTEND_URL || "http://localhost:3000"
      }/register to get started.`,
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
    subject: `Contact form message from ${fromName} <${fromEmail}>`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 25px; border-radius: 8px;">
          <h2>New contact request</h2>
          <p><strong>From:</strong> ${fromName} &lt;${fromEmail}&gt;</p>
          <hr />
          <div style="white-space: pre-wrap;">${message}</div>
        </div>
      </div>
    `,
    text: `From: ${fromName} <${fromEmail}>\n\n${message}`,
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
    subject: `New User Report - Conversation Reported`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #d32f2f; margin-bottom: 20px;">⚠️ New User Report</h2>
          <p style="color: #333; font-size: 16px; margin: 10px 0;"><strong>Reported By:</strong> ${reportedBy}</p>
          <p style="color: #333; font-size: 16px; margin: 10px 0;"><strong>Reported Person:</strong> ${reportedPerson}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #333; font-size: 16px; margin: 10px 0;"><strong>Report Reason:</strong></p>
          <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; border-radius: 4px;">
            <p style="color: #333; margin: 0;">${reportReason}</p>
          </div>
          <p style="color: #666; font-size: 14px; margin-top: 20px;">Please review this report and take appropriate action.</p>
        </div>
      </div>
    `,
    text: `New User Report\n\nReported By: ${reportedBy}\nReported Person: ${reportedPerson}\n\nReport Reason: ${reportReason}`,
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
    subject: "Request to Update KVK Number",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; background-color: #f4f6f8;">
        <div style="background-color: #ffffff; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          
          <h2 style="color: #1976d2; margin-bottom: 20px;">
            📄 KVK Number Update Request
          </h2>

          <p style="color: #333; font-size: 16px;">
            A vendor has requested an update to their KVK number. Please review the details below.
          </p>

          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />

          <p style="color: #333; font-size: 16px; margin: 8px 0;">
            <strong>Vendor Name:</strong> ${body.vendorName}
          </p>

          <p style="color: #333; font-size: 16px; margin: 8px 0;">
            <strong>Vendor Email:</strong> ${body.vendorEmail}
          </p>

          <p style="color: #333; font-size: 16px; margin: 15px 0;">
            <strong>Request Description:</strong>
          </p>

          <div style="background-color: #f1f8ff; border-left: 4px solid #1976d2; padding: 15px; border-radius: 4px;">
            <p style="color: #333; margin: 0;">
              ${body.description}
            </p>
          </div>

          <p style="color: #666; font-size: 14px; margin-top: 25px;">
            Kindly verify the request and update the KVK details if everything is in order.
          </p>

        </div>
      </div>
    `,
    text: `
KVK Number Update Request

Vendor Name: ${body.vendorName}
Vendor Email: ${body.vendorEmail}

Description:
${body.description}

Please review and process this request accordingly.
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

async function sendOrderAcceptanceEmail({ customerEmail, customerName, bookingId, status, bookingDate, bookingTime }) {
  // Configure your transporter
  console.log(customerEmail, customerName, bookingId, status, bookingDate, bookingTime, "EMAIL DETAILS") // Log the email details for debugging;

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
    subject: `Booking Accepted – Booking ID: ${bookingId}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f6f8;">
        <div style="background-color: #ffffff; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #1976d2;">✅ Your Booking is Accepted</h2>
          <p>Hello <strong>${customerName}</strong>,</p>
          <p>We are happy to inform you that your booking has been <strong>${status}</strong>.</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />

          <p><strong>Booking ID:</strong> ${bookingId}</p>
          <p><strong>Date:</strong> ${bookingDate}</p>
          <p><strong>Time:</strong> ${bookingTime}</p>

          <p style="margin-top: 20px;">Thank you for choosing our services. If you have any questions, feel free to reply to this email.</p>

          <p style="color: #666; font-size: 14px;">Best regards,<br/>Evenlyo Team</p>
        </div>
      </div>
    `,
    text: `
Hello ${customerName},

We are happy to inform you that your booking has been ${status}.

Booking ID: ${bookingId}
Date: ${bookingDate}
Time: ${bookingTime}

Thank you for choosing our services.

Best regards,
Evenlyo
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Order acceptance email sent:", info.messageId);
    return info;
  } catch (error) {
    console.error("Error sending order acceptance email:", error);
    throw error;
  }
};


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
    subject: `Booking Completed – Booking ID: ${bookingId}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f6f8;">
        <div style="background-color: #ffffff; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #388e3c;">✅ Your Booking is Completed</h2>
          <p>Hello <strong>${customerName}</strong>,</p>
          <p>We are pleased to inform you that your booking for <strong>${listingTitle}</strong> has been successfully completed.</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />

          <p><strong>Booking ID:</strong> ${bookingId}</p>
          <p><strong>Date:</strong> ${bookingDate}</p>
          <p><strong>Time:</strong> ${bookingTime}</p>
          <p><strong>Total Amount:</strong> $${totalAmount}</p>

          <p style="margin-top: 20px;">Thank you for using our services. We hope you had a great experience!</p>

          <p style="color: #666; font-size: 14px;">Best regards,<br/>Evenlyo Team</p>
        </div>
      </div>
    `,
    text: `
Hello ${customerName},

We are pleased to inform you that your booking for ${listingTitle} has been successfully completed.

Booking ID: ${bookingId}
Date: ${bookingDate}
Time: ${bookingTime}
Total Amount: $${totalAmount}

Thank you for using our services. We hope you had a great experience!

Best regards,
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


const sendReminderEmail = async (booking, daysLeft) => {
  const remainingAmount =
    (booking.pricingBreakdown?.total || 0) - (booking.AmountPaid || 0);

  const eventDateFormatted = moment(booking.details.startDate)
    .format("DD MMM YYYY HH:mm");

  // ⚠ Conditional warning only for 1-day reminder
  const cancellationWarning =
    daysLeft === 1
      ? `
        <div style="margin-top:20px;padding:15px;background:#fff3cd;border:1px solid #ffeeba;border-radius:6px;">
          <strong style="color:#856404;">⚠ Important Notice:</strong>
          <p style="margin:8px 0 0 0;color:#856404;">
            If the remaining payment is not completed before the event date and time,
            your booking will be automatically cancelled.
          </p>
        </div>
      `
      : "";

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
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
      <p><strong>Service:</strong> ${booking.listingId?.title || "Package"}</p>

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
    </div>
  `;

  await sendEmail(
    booking.userId.email,
    `Your Event is in ${daysLeft} Day${daysLeft > 1 ? "s" : ""} – Payment Reminder`,
    emailHtml
  );
};

module.exports = {
  sendOTPEmail,
  sendPromotionalEmail,
  sendContactEmail,
  sendReportEmail,
  sendForgotOTPADMIN,
  sendKvkUpdateEmail,
  sendOrderAcceptanceEmail,
  sendBookingCompletionEmail,
  sendReminderEmail
};
