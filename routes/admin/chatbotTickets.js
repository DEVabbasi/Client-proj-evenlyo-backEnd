const express = require('express');
const router  = express.Router();
const ctrl    = require('../../controllers/admin/chatbotTicketController');
 
// Public — called by chatbot widget
router.post('/chatbot-tickets/create',               ctrl.createChatbotTicket);
 
// Admin
router.get('/admin/chatbot-tickets',                 ctrl.getAllChatbotTickets);
router.get('/admin/chatbot-tickets/:id',             ctrl.getChatbotTicket);
router.put('/admin/chatbot-tickets/:id/status',      ctrl.updateChatbotTicketStatus);
router.delete('/admin/chatbot-tickets/:id',          ctrl.deleteChatbotTicket);
router.post('/admin/chatbot-tickets/:id/reply', ctrl.sendTicketReply);
 
module.exports = router;