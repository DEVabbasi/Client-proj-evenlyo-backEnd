const ChatbotTicket = require('../../models/ChatbotTicket');
const { sendChatbotTicketReply } = require("../../utils/mailer");


// ─── Public: User submits ticket from chatbot ─────────────────────────────────
exports.createChatbotTicket = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'name, email, subject, and message are required',
      });
    }

    const ticket = new ChatbotTicket({ name, email, subject, message });
    await ticket.save();

    res.status(201).json({
      success: true,
      message: 'Your query has been submitted. Our team will get back to you soon.',
      data: ticket,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── Admin: Get all chatbot tickets ──────────────────────────────────────────
exports.getAllChatbotTickets = async (req, res) => {
  try {
    const { search = '', status, page = 1, limit = 10 } = req.query;

    const query = {};

    if (search.trim()) {
      query.$or = [
        { name:    { $regex: search, $options: 'i' } },
        { email:   { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } },
      ];
    }

    if (status && status !== 'All') {
      query.status = status.toLowerCase();
    }

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await ChatbotTicket.countDocuments(query);
    const data  = await ChatbotTicket.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data,
      pagination: {
        total,
        page:       parseInt(page),
        limit:      parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── Admin: Get single chatbot ticket ────────────────────────────────────────
exports.getChatbotTicket = async (req, res) => {
  try {
    const ticket = await ChatbotTicket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    res.json({ success: true, data: ticket });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── Admin: Update ticket status ─────────────────────────────────────────────
exports.updateChatbotTicketStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const ticket = await ChatbotTicket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    ticket.status = status;
    await ticket.save();
    res.json({ success: true, message: `Ticket status updated to ${status}`, data: ticket });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── Admin: Delete chatbot ticket ────────────────────────────────────────────
exports.deleteChatbotTicket = async (req, res) => {
  try {
    const ticket = await ChatbotTicket.findByIdAndDelete(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    res.json({ success: true, message: 'Ticket deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── Admin: Send email reply to user ─────────────────────────────────────────
exports.sendTicketReply = async (req, res) => {
  try {
    const { replyMessage } = req.body;
    const ticket = await ChatbotTicket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }
    if (!replyMessage?.trim()) {
      return res.status(400).json({ success: false, message: "Reply message is required" });
    }

    await sendChatbotTicketReply({
      toEmail:      ticket.email,
      toName:       ticket.name,
      subject:      ticket.subject,
      userMessage:  ticket.message,
      adminReply:   replyMessage.trim(),
      ticketId:     ticket._id.toString().slice(-8).toUpperCase(),
    });

    // Auto-move to open when admin replies
    if (ticket.status === "new") {
      ticket.status = "open";
      await ticket.save();
    }

    res.json({ success: true, message: "Reply sent successfully.", data: ticket });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};