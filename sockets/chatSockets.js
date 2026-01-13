const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const createBookingRequest = require("../utils/bookingRequest");
const mongoose = require("mongoose");

function chatSocket(io) {
  io.on("connection", (socket) => {
    console.log("New connection:", socket.id);

    // Join a conversation room for chatting
    socket.on("join_conversation_room", ({ conversationId }) => {
      socket.join(conversationId);
      console.log(`CONVERSATION ROOM JOINED: ${conversationId}`);
    });

    // Admin Connected
    socket.on("vendor_connected", ({ vendorId }) => {
      const room = `vendor_${vendorId}`;
      socket.join(room);
      console.log(`VENDOR_CONNECTED: ${room}`);
    });

    //  User Connected
    socket.on("user_connected", ({ userId }) => {
      const room = `user_${userId}`;
      socket.join(room);
      console.log(`USER_CONNECTED: ${room}`);
    });

    socket.on("send_message", async (params) => {
      console.log("EVENT_FIRED", params);
      const {
        conversationId,
        senderId,
        receiverId,
        senderRole,
        receiverRole,
        senderRefrence,
        receiverRefrence,
        message,
        conversationType,
        attachment,
        isOffer,
        offerObject,
      } = params;

      try {
        const newMessage = new Message({
          conversationId,
          senderId,
          receiverId,
          senderRole,
          receiverRole,
          senderRefrence,
          receiverRefrence,
          message,
          ...(attachment && {
            attachment: {
              url: attachment?.url,
              type: attachment?.type,
              name: attachment?.name,
              size: attachment?.size,
            },
          }),
          ...(isOffer && {
            isOffer,
            offerObject,
          }),
        });
        await newMessage.save();

        console.log("NEW_MESSAGE_SAVED", newMessage);

        try {
          const conversation = await Conversation.findOne({ conversationId });

          if (conversation) {
            conversation.lastMessage =
              message || attachment?.name || "Offer sent";
            conversation.lastUpdated = Date.now();
            conversation.messagesCount += 1;

            const currentUnreadCount =
              conversation.unreadMessagesCount.get(receiverId) || 0;
            conversation.unreadMessagesCount.set(
              receiverId,
              currentUnreadCount + 1
            );

            await conversation.save();

            const conObj = {
              conversationId,
              lastMessage: message || attachment?.name || "Offer sent",
              lastUpdated: Date.now(),
              unreadMessagesCount: Object.fromEntries(
                conversation.unreadMessagesCount
              ),
            };

            if (conversationType === "vender-to-user") {
              io.to(`user_${receiverId}`).emit("new_conversation", conObj);
              io.to(`vendor_${senderId}`).emit("new_conversation", conObj);
            }
            if (conversationType === "user-to-vendor") {
              io.to(`vendor_${receiverId}`).emit("new_conversation", conObj);
              io.to(`user_${senderId}`).emit("new_conversation", conObj);
            }
          }
        } catch (error) {
          console.error("Error updating conversation:", error.message);
        }

        console.log("New message saved:", newMessage);
        socket.broadcast.to(conversationId).emit("receive_message", newMessage);
      } catch (err) {
        console.error("Error saving message:", err.message);
      }
    });

    socket.on("accept_offer", async (offerObject) => {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const uniqueId = offerObject?.uniqueId;
        const message = await Message.findOne({
          "offerObject.uniqueId": uniqueId,
        }).session(session);

        if (!message) {
          await session.abortTransaction();
          await session.endSession();
          return socket.emit("accept_offer_error", {
            message: "Offer not found",
          });
        }

        const updateMessage = await Message.findOneAndUpdate(
          { "offerObject.uniqueId": uniqueId },
          { offerObject: offerObject },
          { new: true }
        ).session(session);

        if (!updateMessage) {
          await session.abortTransaction();
          await session.endSession();
          return socket.emit("accept_offer_error", {
            message: "Offer not found",
          });
        }

        if (offerObject?.items?.length === 0) {
          await session.abortTransaction();
          await session.endSession();
          return socket.emit("accept_offer_error", {
            message: "No items found",
          });
        }


        const finalItems = offerObject.items.map((item, index) => {
          console.log(`Item ${index}:`, item);
          return {
            userId: offerObject.userId,
            listingId: item._id,
            vendorId: item.vendor,
            startDate: item.startDate,
            endDate: item.endDate,
            startTime: item.startTime,
            endTime: item.endTime,
            eventLocation: item.eventLocation,
            eventType: item.eventType || "",
            guestCount: item.guestCount || 0,
            distanceKm: item.distanceKm || 0,
            specialRequests: item.specialRequest || "",
            totalAmount: item.total,
            securityFee: item.securityFee,
            status: item.offerStatus,
            pricingBreakdown: item.pricingBreakdown
          };
        });

        console.log("finalItemsfinalItems", finalItems);

        for (let item of finalItems) {
          await createBookingRequest(item, session);
        }

        // All booking requests created successfully - commit transaction
        await session.commitTransaction();
        await session.endSession();

        io.to(message.conversationId).emit("offer_accepted", updateMessage);
      } catch (error) {
        console.error("Error accepting offer:", error.message);

        try {
          await session.abortTransaction();
        } catch (abortError) {
          console.error("Error aborting transaction:", abortError.message);
        }

        try {
          await session.endSession();
        } catch (endError) {
          console.error("Error ending session:", endError.message);
        }

        socket.emit("accept_offer_error", {
          message: error.message || "Error accepting offer",
          error: error.message,
        });
      }
    });

    socket.on(
      "reset_unread_count",
      async ({ conversationId, userId, userType }) => {
        try {
          const conversation = await Conversation.findOne({ conversationId });
          if (conversation) {
            if (conversation.unreadMessagesCount.has(userId)) {
              conversation.unreadMessagesCount.set(userId, 0);
              await conversation.save();

              const conObj = {
                conversationId,
                isListUpdated: false,
                lastMessage: conversation.lastMessage,
                lastUpdated: conversation.lastUpdated,
                unreadMessagesCount: Object.fromEntries(
                  conversation.unreadMessagesCount
                ),
              };

              if (userType === "user") {
                io.to(`user_${userId}`).emit("new_conversation", conObj);
              }
              if (userType === "vendor") {
                io.to(`vendor_${userId}`).emit("new_conversation", conObj);
              }
            }
          }
        } catch (error) {
          console.error("Error resetting unread count:", error.message);
        }
      }
    );

    socket.on("typing", ({ conversationId, senderId }) => {
      socket.broadcast.to(conversationId).emit("user_typing", { senderId });
    });

    socket.on("stop_typing", ({ conversationId, senderId }) => {
      socket.broadcast
        .to(conversationId)
        .emit("user_stop_typing", { senderId });
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log("❌ User disconnected:", socket.id);
    });
  });
}

module.exports = chatSocket;
