const SupportTicket = require('../../models/SupportTicket');
const User = require('../../models/User');
const { toMultilingualText } = require('../../utils/textUtils');
const { sendContactEmail } = require('../../utils/mailer');
const notificationController = require("../../controllers/notificationController")

// Create a new support ticket
const createSupportTicket = async (req, res) => {
  try {
    // Accept payload in { data: { issueRelatedto, details } } format
    // const { data } = req.body;
    // if (!data || typeof data !== 'object') {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Payload must be in the format { data: { issueRelatedto, details } }'
    //   });
    // }
    // let { issueRelatedto, details } = data;

    // // Normalize to multilingual object using shared util
    // issueRelatedto = (issueRelatedto);
    // details = toMultilingualText(details);

    // // Validate required fields
    // if (!issueRelatedto || !issueRelatedto|| !details || !details.en || !details.nl) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Issue category and details are required '
    //   });
    // }

    // // Validate details length (check at least English length)
    // if ((details.en || '').length < 10) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Details must be at least 10 characters long'
    //   });
    // }

    // ...existing code...

    // Get user info from session

    const { issueRelatedto, details } = req.body
    console.log(req.user, req.body, "req.userreq.userreq.user");

    const userId = req.user.id;
    const userEmail = req.user.email;

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Create support ticket
    const supportTicket = new SupportTicket({
      userEmail,
      userId,
      issueRelatedto,
      details
    });

    await notificationController.createNotification({
      title: {
        en: "New Support Ticket",
        nl: "Nieuw supportticket",
      },
      message: {
        en: "A new support ticket has been created",
        nl: "Er is een nieuw supportticket aangemaakt",
      },
      notificationFor: "Admin",
      clientId: null, // vendor's user account receives notification
      vendorId: null,// vendor's user account receives notification
      bookingId: null,
    });

    await supportTicket.save();

    res.status(201).json({
      success: true,
      message: 'Support ticket created successfully',
      data: {
        ticketId: supportTicket.ticketId,
        issueRelatedto: supportTicket.issueRelatedto,
        details: supportTicket.details,
        status: supportTicket.status,
        createdAt: supportTicket.createdAt
      }
    });

  } catch (error) {
    console.error('Error creating support ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create support ticket'
    });
  }
};


// Public contact endpoint - allows anonymous users to send a message to site owners
const contactUs = async (req, res) => {
  try {
    const { email, name, message } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'A valid email is required' });
    }
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'A valid name is required' });
    }
    if (!message || typeof message !== 'string' || message.trim().length < 10) {
      return res.status(400).json({ success: false, message: 'Message must be at least 10 characters' });
    }

    // Send email to contact address (falls back to info@evenlyo.nl)
    await sendContactEmail(email.trim(), name.trim(), message.trim());

    return res.status(200).json({ success: true, message: 'Your message has been sent. Thank you!' });
  } catch (err) {
    console.error('Error in contactUs:', err);
    return res.status(500).json({ success: false, message: 'Failed to send message' });
  }
};

module.exports = {
  createSupportTicket,
  contactUs,
};
