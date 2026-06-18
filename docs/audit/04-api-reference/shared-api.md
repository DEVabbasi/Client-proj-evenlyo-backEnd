# API Reference — Shared

Notifications, settings (user), chat, chatbot — used across roles.

---

## Notifications `/api/notifications`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | requireAuth | Client notifications |
| GET | `/admin-notifications` | **Public** | Admin notifications |
| GET | `/vendor-notifications` | requireAuth | Vendor notifications |
| PATCH | `/:id/client-read` | requireAuth | Client mark read |
| PATCH | `/:id/read` | requireAuth | Vendor mark read |
| PATCH | `/read-all` | **Public** | Mark all read |

Flow: [notifications-and-email.md](../03-flows/notifications-and-email.md)

---

## Settings `/api/settings`

| GET/PUT | `/personal-info` | requireAuth | |
| PUT | `/change-password` | requireAuth | |
| GET/PUT | `/notifications` | requireAuth | Email/push toggles |
| POST | `/vendor/full-data` | **Public** | Vendor data lookup |
| GET | `/health` | **Public** | |

---

## Chatbot `/api/chatbot`

| POST | `/message` | **Public** | AI chat |
| POST | `/ticket` | **Public** | Escalate to human |
| GET | `/health` | **Public** | |

---

## Conversations `/api/conversations` (**Public**)

| POST | `/` | Create conversation |
| GET | `/:id/:type` | List by user + type |
| GET | `/single/:userId/:vendorId` | Single thread |
| PATCH | `/block/:id`, `/unblock/:id`, `/report/:id` | Moderation |

---

## Messages `/api/messages` (**Public**)

| GET | `/:conversationId/:userId` | Message history |
| DELETE | `/:conversationId/:userId` | Soft delete |

---

## Chat rooms `/api/chatrooms` (**Public**, legacy)

| POST | `/` | Get or create room |
| GET | `/:userId` | User rooms |
| GET | `/recent/:userId` | Recent chats |

---

## Socket.IO events

Not REST — see [chat-and-messaging.md](../03-flows/chat-and-messaging.md):

- `join_conversation_room`, `user_connected`, `vendor_connected`
- `send_message`
- Booking creation from chat context

---

## App settings

| GET | `/api/getSetings` | **Public** | Mobile app settings |
