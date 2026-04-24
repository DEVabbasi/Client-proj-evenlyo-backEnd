// routes/client/chatbot.js
// ─────────────────────────────────────────────────────────────────────────────
// Chatbot routes — mounted under /api/chatbot in app.js
// Matches project route style (see blogs.js, bookings.js, etc.)
// ─────────────────────────────────────────────────────────────────────────────

const express = require("express");
const router = express.Router();
const { sendMessage, healthCheck, createTicket } = require("../../controllers/client/chatbotController");

// Optional: uncomment to restrict chatbot to logged-in clients only
// const { requireAuth } = require("../../middleware/authMiddleware");

// POST /api/chatbot/message — main AI chat endpoint
// Add requireAuth before sendMessage to restrict to logged-in users:
// router.post("/message", requireAuth, sendMessage);
router.post("/message", sendMessage);
router.post("/ticket",  createTicket);
// GET /api/chatbot/health — service health check
router.get("/health", healthCheck);

module.exports = router;