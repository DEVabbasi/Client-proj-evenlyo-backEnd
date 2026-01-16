const SupportTicket = require('../../models/SupportTicket');
const { sendOTPEmail, sendPromotionalEmail } = require('../../utils/mailer');
// Send email to support ticket user
exports.sendEmailToTicketUser = async (req, res) => {
    try {
        console.log(process.env, " process.env process.env process.env");

        const { ticketId } = req.params;
        const { subject, message } = req.body;
        const ticket = await SupportTicket.findOne({ ticketId });
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }
        const toEmail = ticket.userEmail;
        if (!toEmail) {
            return res.status(400).json({ success: false, message: 'User email not found for this ticket' });
        }
        // Use nodemailer directly for custom message
        const nodemailer = require('nodemailer');
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
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: toEmail,
            subject: subject || 'Support Ticket Response from Evenlyo',
            html: `<div style="font-family: Arial, sans-serif; padding: 20px;">${message}</div>`
        };
        await transporter.sendMail(mailOptions);
        res.status(200).json({ success: true, message: 'Email sent successfully' });
    } catch (error) {
        console.log(error, "errorerrorerrorerror");
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// Get all support tickets for admin
exports.getAllSupportTickets = async (req, res) => {
    try {
        const tickets = await SupportTicket.find({})
            .select('ticketId createdAt issueRelatedTo issueRelatedto details status userEmail')
            .sort({ createdAt: -1 })

        const formattedTickets = tickets.map(ticket => ({
            ticketId: ticket.ticketId,
            time: ticket.createdAt,
            issueRelatedTo: ticket.issueRelatedTo || ticket.issueRelatedto || '',
            details: ticket.details,
            status: ticket.status,
            email: ticket.userEmail
        }));

        res.status(200).json({ success: true, tickets: formattedTickets });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// Toggle status of a support ticket
exports.toggleTicketStatus = async (req, res) => {
    try {
        const { ticketId } = req.params;
        const ticket = await SupportTicket.findOne({ ticketId });
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }
        ticket.status = ticket.status === 'open' ? 'closed' : 'open';
        await ticket.save();
        res.status(200).json({ success: true, message: `Ticket status updated to ${ticket.status}`, status: ticket.status });
    } catch (error) {
        console.log(error, "errorerrorerror");

        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};
