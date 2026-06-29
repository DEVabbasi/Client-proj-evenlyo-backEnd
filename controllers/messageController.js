const Message = require("../models/Message");
const Conversation = require("../models/Conversation");

const WELCOME_MESSAGES = {
  en: "Welcome to our service!",
  nl: "Welkom bij onze service!",
};

const normalizeId = (id) => String(id || "");

const getWelcomeMessage = (language = "en") =>
  WELCOME_MESSAGES[language === "nl" ? "nl" : "en"];

const seedClientWelcomeMessage = async ({
  conversation,
  conversationId,
  clientUserId,
  vendorId,
  language,
}) => {
  const existingCount = await Message.countDocuments({ conversationId });
  if (existingCount > 0) {
    return null;
  }

  const welcomeText = getWelcomeMessage(language);
  const welcomeMessage = await Message.create({
    conversationId,
    senderId: vendorId,
    receiverId: clientUserId,
    senderRole: "vendor",
    receiverRole: "user",
    senderRefrence: "Vendor",
    receiverRefrence: "User",
    message: welcomeText,
  });

  conversation.lastMessage = welcomeText;
  conversation.lastUpdated = Date.now();
  conversation.messagesCount = (conversation.messagesCount || 0) + 1;

  const clientUnreadKey = normalizeId(clientUserId);
  const currentUnread =
    conversation.unreadMessagesCount?.get?.(clientUnreadKey) || 0;
  conversation.unreadMessagesCount.set(clientUnreadKey, currentUnread + 1);

  await conversation.save();

  return welcomeMessage;
};

// Get all messages in a chat room
const getMessages = async (req, res) => {
  try {
    const { conversationId, userId } = req.params;
    const preferredLanguage = req.query.preferredLanguage === "nl" ? "nl" : "en";

    const conversation = await Conversation.findOne({ conversationId });
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    const clientParticipant = conversation.participants.find(
      (participant) => participant.role === "user"
    );
    const vendorParticipant = conversation.participants.find(
      (participant) => participant.role === "vendor"
    );

    const clientUserId = normalizeId(clientParticipant?.userId);
    const vendorId = normalizeId(vendorParticipant?.userId);
    const requesterId = normalizeId(userId);
    const isClientRequest = requesterId === clientUserId;

    let messages = await Message.find({
      conversationId,
      deletedFor: { $ne: userId },
    }).sort({ createdAt: 1 });

    if (messages.length === 0 && isClientRequest && clientUserId && vendorId) {
      const welcomeMessage = await seedClientWelcomeMessage({
        conversation,
        conversationId,
        clientUserId,
        vendorId,
        language: preferredLanguage,
      });

      if (welcomeMessage) {
        messages = [welcomeMessage];
      } else {
        messages = await Message.find({
          conversationId,
          deletedFor: { $ne: userId },
        }).sort({ createdAt: 1 });
      }
    }

    res.status(200).json({
      success: true,
      message: "Messages fetched successfully",
      data: messages,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error fetching messages",
      error: err.message,
    });
  }
};

// const getMessages = async (req, res) => {
//   try {
//     const { conversationId } = req.params;
//     const { page = 1, limit = 30 } = req.query;

//     const skip = (page - 1) * limit;

//     // Newest messages last me aayein → sort ascending by createdAt
//     const messages = await Message.find({ conversationId })
//       .sort({ createdAt: -1 }) // newest first
//       .skip(skip)
//       .limit(Number(limit));

//     const totalMessages = await Message.countDocuments({ conversationId });

//     res.status(200).json({
//       success: true,
//       message: "Messages fetched successfully",
//       data: messages.reverse(), // reverse to show oldest → newest in frontend
//       hasMore: skip + Number(limit) < totalMessages,
//     });
//   } catch (err) {
//     res.status(500).json({
//       success: false,
//       message: "Error fetching messages",
//       error: err.message,
//     });
//   }
// };

// Send a message
const sendMessage = async (req, res) => {
  try {
    const { sender, content, chatRoom } = req.body;
    const newMessage = await Message.create({ sender, content, chatRoom });
    res.status(201).json(newMessage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Mark message as read
const markAsRead = async (req, res) => {
  try {
    const { messageId, userId } = req.body;
    const updatedMsg = await Message.findByIdAndUpdate(
      messageId,
      { $addToSet: { readBy: userId } },
      { new: true }
    );
    res.json(updatedMsg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const softDeleteMessage = async (req, res) => {
  try {
    const { conversationId, userId } = req.params;
    await Message.updateMany(
      { conversationId },
      { $addToSet: { deletedFor: userId } }
    );
    res.json({ success: true, message: "Message deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getMessages,
  sendMessage,
  markAsRead,
  softDeleteMessage,
};
