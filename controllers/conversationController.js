const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const { sendReportEmail } = require("../utils/mailer");

const WELCOME_MESSAGE = "How can we help you!";

const createChatUserWithVendor = async (req, res) => {
  const { userId, vendorId } = req.body;
  const io = req.app.get("socketio");

  try {
    const conversation = await Conversation.findOne({
      participants: {
        $all: [
          { $elemMatch: { role: "vendor", userId: vendorId } },
          { $elemMatch: { role: "user", userId: userId } },
        ],
      },
    })
      .sort({ lastUpdated: -1 })
      .populate("participants.userId");

    if (conversation) {
      return res.status(200).json({
        success: true,
        message: "Conversation already exists",
        data: conversation,
      });
    }

    const payloadWithWorker = {
      participants: [
        { userId: vendorId, role: "vendor", refPath: "Vendor" },
        { userId: userId, role: "user", refPath: "User" },
      ],
      conversationId: `${vendorId}_${userId}`,
      lastMessage: WELCOME_MESSAGE,
      lastUpdated: Date.now(),
      unreadMessagesCount: new Map([
        [vendorId.toString(), 1],
        [userId, 0],
      ]),
    };

    const createdConversation = await Conversation.create(payloadWithWorker);
    const newConversation = await createdConversation.populate(
      "participants.userId",
    );

    const newMessage = new Message({
      conversationId: newConversation?.conversationId,
      senderId: vendorId,
      receiverId: userId,
      senderRole: "vendor",
      receiverRole: "user",
      senderRefrence: "Vendor",
      receiverRefrence: "User",
      message: WELCOME_MESSAGE,
    });
    await newMessage.save();

    io.to(`user_${userId}`).emit("new_conversation", newConversation);
    io.to(`vendor_${vendorId}`).emit("new_conversation", newConversation);

    return res.status(200).json({
      success: true,
      // message: "Conversation created successfully",
      message: {
        en: "Conversation created sucessfully",
        nl: "Het gesprek is succesvol tot stand gekomen.",
      },
      data: newConversation,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: {
        en: "Error creating conversation",
        nl: "Fout bij maken van gesprek",
      },
      error: error.message,
    });
  }
};

const getConversations = async (req, res) => {
  try {
    const { id, type } = req.params;

    console.log("IDDDDDDDDDDDDDDDDDS:", id, type);

    let filter = {
      "participants.userId": id,
      "participants.role": type,
    };

    const conversations = await Conversation.find(filter)
      .populate("participants.userId")
      .sort({ lastUpdated: -1 });

    return res.status(200).json({
      success: true,
      message: "Conversation fetched successfully",
      data: conversations,
      // data: [
      //   ...conversations,
      //   ...conversations,
      //   ...conversations,
      //   ...conversations,
      //   ...conversations,
      // ],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching conversations",
      error: error.message,
    });
  }
};

const getSingleConversationWithVendor = async (req, res) => {
  try {
    const { userId, vendorId } = req.params;

    // console.log("IDDDDDDDDDDDDDDDDDS:", userId, vendorId);

    const conversation = await Conversation.findOne({
      participants: {
        $all: [
          { $elemMatch: { role: "vendor", userId: vendorId } },
          { $elemMatch: { role: "user", userId: userId } },
        ],
      },
    })
      .sort({ lastUpdated: -1 })
      .populate("participants.userId");

    return res.status(200).json({
      success: true,
      message: "Conversation fetched successfully",
      data: conversation,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching conversation",
      error: error.message,
    });
  }
};

const blockConversation = async (req, res) => {
  const { id } = req.params;
  const { userId, userType } = req.body;
  const io = req.app.get("socketio");

  try {
    if (!userId || !userType) {
      return res.status(400).json({
        success: false,
        message: "User ID and user type are required",
      });
    }

    if (!["User", "Vendor"].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user type. Must be 'User' or 'Vendor'",
      });
    }

    const convo = await Conversation.findById(id);
    if (!convo)
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });

    const blockedBy = userId;
    const blockedByRefrence = userType;

    convo.blockedBy = blockedBy;
    convo.blockedByRefrence = blockedByRefrence;
    convo.isBlocked = true;
    await convo.save();

    io.to(
      `user_${convo.participants.find((p) => p.role === "user")?.userId}`,
    ).emit("conversation_blocked", convo);
    io.to(
      `vendor_${convo.participants.find((p) => p.role === "vendor")?.userId}`,
    ).emit("conversation_blocked", convo);

    return res.status(200).json({
      success: true,
      message: "Conversation blocked successfully",
      data: convo,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error blocking conversation",
      error: error.message,
    });
  }
};

const unblockConversation = async (req, res) => {
  const { id } = req.params;
  const io = req.app.get("socketio");

  try {
    const convo = await Conversation.findById(id);
    if (!convo)
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });

    convo.blockedBy = null;
    convo.blockedByRefrence = null;
    convo.isBlocked = false;

    convo.reportedBy = null;
    convo.reportedByRefrence = null;
    convo.isReported = false;
    convo.reportReason = "";

    await convo.save();

    io.to(
      `user_${convo.participants.find((p) => p.role === "user")?.userId}`,
    ).emit("conversation_unblocked", convo);
    io.to(
      `vendor_${convo.participants.find((p) => p.role === "vendor")?.userId}`,
    ).emit("conversation_unblocked", convo);

    return res.status(200).json({
      success: true,
      message: "Conversation unblocked successfully",
      data: convo,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error unblocking conversation",
      error: error.message,
    });
  }
};

const reportConversation = async (req, res) => {
  const { id } = req.params;
  const { userId, userType, reportReason, reporter, reportedPerson } = req.body;
  const io = req.app.get("socketio");

  try {
    if (!userId || !userType || !reportReason.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "User ID, user type and report reason (not empty) are required",
      });
    }

    if (!["User", "Vendor"].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user type. Must be 'User' or 'Vendor'",
      });
    }

    const convo = await Conversation.findById(id);
    if (!convo)
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });

    const reportedBy = userId;
    const reportedByRefrence = userType;

    convo.reportedBy = reportedBy;
    convo.reportedByRefrence = reportedByRefrence;
    convo.isReported = true;
    convo.reportReason = reportReason;

    convo.blockedBy = reportedBy;
    convo.blockedByRefrence = reportedByRefrence;
    convo.isBlocked = true;

    await convo.save();

    io.to(
      `user_${convo.participants.find((p) => p.role === "user")?.userId}`,
    ).emit("conversation_blocked", convo);
    io.to(
      `vendor_${convo.participants.find((p) => p.role === "vendor")?.userId}`,
    ).emit("conversation_blocked", convo);

    res.status(200).json({
      success: true,
      message: "Conversation reported successfully",
      data: convo,
    });

    return await sendReportEmail(
      "masoodansari584@gmail.com",
      reporter,
      reportedPerson,
      reportReason,
    );
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error reporting conversation",
      error: error.message,
    });
  }
};

module.exports = {
  createChatUserWithVendor,
  getConversations,
  getSingleConversationWithVendor,
  blockConversation,
  unblockConversation,
  reportConversation,
};
