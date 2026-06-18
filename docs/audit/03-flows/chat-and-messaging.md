# Flow: Chat and Messaging

Real-time chat uses **Socket.IO**; REST endpoints provide conversation/message CRUD **without route-level auth**.

---

## Socket.IO (`sockets/chatSockets.js`)

Loaded in `server.js`. Clients join rooms:

- `join_conversation_room` — `{ conversationId }`
- `user_connected` — `user_{userId}`
- `vendor_connected` — `vendor_{vendorId}`

### `send_message` event

1. Normalizes roles for `user-to-vendor` / `vendor-to-user`
2. Creates/updates `Conversation` + `Message`
3. Emits to conversation room + user/vendor rooms
4. Optional offer messages (`isOffer`, `offerObject`)
5. May trigger `notificationController` for offline users

### Booking via chat

`createBookingRequest` from `utils/bookingRequest.js` can be invoked from socket flow — creates booking from chat context.

---

## REST API (unauthenticated at route level)

### Conversations — `/api/conversations`

| Method | Path | Handler |
|--------|------|---------|
| POST | `/` | `createChatUserWithVendor` |
| GET | `/:id/:type` | `getConversations` |
| GET | `/single/:userId/:vendorId` | Single thread |
| PATCH | `/block/:id`, `/unblock/:id`, `/report/:id` | Moderation |

### Messages — `/api/messages`

| Method | Path | Handler |
|--------|------|---------|
| GET | `/:conversationId/:userId` | `getMessages` |
| DELETE | `/:conversationId/:userId` | `softDeleteMessage` |

### Chat rooms (legacy) — `/api/chatrooms`

`getOrCreateRoom`, `getUserRooms`, `getRecentChats`

> **Audit — Critical:** No `requireAuth` on any chat REST route — IDOR risk if conversation IDs leak. [05-audit-findings.md](../05-audit-findings.md#C-006)

---

## Data models

- **Conversation** — `conversationId` string (unique), participants with `refPath` User/Vendor
- **Message** — `conversationId`, `attachment`, `isOffer`
- **ChatRoom** — legacy parallel system

---

## Related

- [booking-lifecycle.md](./booking-lifecycle.md)
- [shared-api.md](../04-api-reference/shared-api.md)
