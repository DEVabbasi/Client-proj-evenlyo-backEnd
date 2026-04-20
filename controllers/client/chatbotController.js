// controllers/client/chatbotController.js
// ─────────────────────────────────────────────────────────────────────────────
// Evenlyo AI Chatbot Controller — OpenAI Function Calling (Tool Calling)
// Pattern: asyncHandler + logger (matches your project style)
//
// TWO-ROUND GPT FLOW:
//   Round 1 → GPT decides: answer directly OR call a tool
//   Round 2 → Tool result fed back to GPT → human-readable reply
// ─────────────────────────────────────────────────────────────────────────────

const asyncHandler     = require("express-async-handler");
const OpenAI           = require("openai");
const logger           = require("../../utils/logger");
const SYSTEM_PROMPT    = require("../../chatbot/systemPrompt");
const TOOL_DEFINITIONS = require("../../chatbot/toolDefinitions");
const { executeTool }  = require("../../chatbot/toolRegistry");

// ── OpenAI client singleton ───────────────────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Rate limiter (in-memory — swap for Redis in production) ───────────────
const _rateLimitMap = new Map();
function _isRateLimited(key) {
  const now   = Date.now();
  const entry = _rateLimitMap.get(key) || { count: 0, windowStart: now };
  if (now - entry.windowStart > 60_000) {
    entry.count      = 0;
    entry.windowStart = now;
  }
  entry.count++;
  _rateLimitMap.set(key, entry);
  return entry.count > 30;
}

// ── Build OpenAI history from frontend format ─────────────────────────────
// Frontend: { from: "user"|"bot", text: "..." }
// OpenAI:   { role: "user"|"assistant", content: "..." }
function _buildHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];
  return rawHistory
    .slice(-10)
    .filter((m) => m && typeof m.text === "string" && ["user", "bot"].includes(m.from))
    .map((m) => ({
      role:    m.from === "bot" ? "assistant" : "user",
      content: String(m.text).slice(0, 800),
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Send message to AI chatbot
// @route   POST /api/chatbot/message
// @access  Public (add requireAuth in chatbot.js route to restrict to logged-in)
// ─────────────────────────────────────────────────────────────────────────────
const sendMessage = asyncHandler(async (req, res) => {
  const { message, history = [] } = req.body;
  const userId = req.user?._id?.toString() || req.ip;

  // ── Validation ───────────────────────────────────────────────────────────
  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400);
    throw new Error("Message is required.");
  }
  if (message.trim().length > 500) {
    res.status(400);
    throw new Error("Message too long. Max 500 characters.");
  }

  // ── Rate limit ───────────────────────────────────────────────────────────
  if (_isRateLimited(userId)) {
    logger.warn(`[Chatbot] Rate limit: ${userId}`);
    return res.status(429).json({
      success: false,
      reply: "You're sending messages too quickly! Please wait a moment. 😊",
    });
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ..._buildHistory(history),
    { role: "user", content: message.trim() },
  ];

  logger.info(`[Chatbot] Round1 — user:${userId} | len:${message.length}`);

  // ── ROUND 1: GPT decides — direct answer or tool call ────────────────────
  const round1 = await openai.chat.completions.create({
    model:       "gpt-4o-mini",
    messages,
    tools:       TOOL_DEFINITIONS,
    tool_choice: "auto",
    max_tokens:  450,
    temperature: 0.6,
  });

  const choice = round1.choices[0];

  // ── Path A: Direct answer ─────────────────────────────────────────────────
  if (choice.finish_reason === "stop") {
    logger.info(`[Chatbot] Direct | tokens:${round1.usage?.total_tokens}`);
    return res.status(200).json({
      success:  true,
      reply:    choice.message.content?.trim(),
      toolUsed: null,
      usage:    { totalTokens: round1.usage?.total_tokens },
    });
  }

  // ── Path B: Tool call ─────────────────────────────────────────────────────
  if (choice.finish_reason === "tool_calls") {
    const toolCall = choice.message.tool_calls[0];
    const toolName = toolCall.function.name;
    let   toolArgs = {};

    try {
      toolArgs = JSON.parse(toolCall.function.arguments);
    } catch {
      logger.error(`[Chatbot] Bad tool args for ${toolName}`);
    }

    logger.info(`[Chatbot] Tool: ${toolName}`, toolArgs);

    // Run the MongoDB query via tool handler
    const toolResult = await executeTool(toolName, toolArgs, { userId });

    // ── ROUND 2: Feed DB result → GPT → human-readable reply ─────────────────
    const round2 = await openai.chat.completions.create({
      model:    "gpt-4o-mini",
      messages: [
        ...messages,
        choice.message,
        {
          role:         "tool",
          tool_call_id: toolCall.id,
          content:      JSON.stringify(toolResult),
        },
      ],
      max_tokens:  550,
      temperature: 0.6,
    });

    const reply = round2.choices[0].message.content?.trim();

    logger.info(`[Chatbot] Tool reply | ${toolName} | tokens:${round2.usage?.total_tokens}`);

    return res.status(200).json({
      success:  true,
      reply,
      toolUsed: toolName,
      usage: {
        round1Tokens: round1.usage?.total_tokens,
        round2Tokens: round2.usage?.total_tokens,
        totalTokens:
          (round1.usage?.total_tokens || 0) + (round2.usage?.total_tokens || 0),
      },
    });
  }

  // Fallback
  return res.status(200).json({
    success:  true,
    reply:    "I couldn't process that. Please try rephrasing.",
    toolUsed: null,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Health check
// @route   GET /api/chatbot/health
// ─────────────────────────────────────────────────────────────────────────────
const healthCheck = asyncHandler(async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    res.status(500);
    throw new Error("OpenAI API key not configured.");
  }
  return res.status(200).json({
    success: true,
    status:  "ok",
    service: "Evenlyo AI Chatbot",
    model:   "gpt-4o-mini",
    tools:   TOOL_DEFINITIONS.map((t) => t.function.name),
  });
});

module.exports = { sendMessage, healthCheck };