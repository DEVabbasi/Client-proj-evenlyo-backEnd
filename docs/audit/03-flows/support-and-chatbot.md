# Flow: Support and Chatbot

Human support tickets + AI chatbot with OpenAI function calling.

---

## Client support

### Contact form (public)

`POST /api/support/contact` — `contactUs` — no auth. Sends email to `CONTACT_EMAIL`.

### Authenticated ticket

`POST /api/support/ticket` — `requireAuth` — `createSupportTicket`

Creates `SupportTicket` with `ticketId`, links `userId`, optional `trackingId`.

---

## Admin support (`/api/admin/support` — **no auth**)

| Endpoint | Purpose |
|----------|---------|
| `GET /support-tickets` | List all tickets |
| `POST /ticket-status/:ticketId` | Toggle open/closed |
| `POST /send-email/:ticketId` | Email user `{ subject, message }` |

`sendEmailToTicketUser` uses inline Nodemailer (same `EMAIL_*` vars).

> **Audit — Critical:** Unauthenticated admin support routes. [05-audit-findings.md](../05-audit-findings.md#C-001)

---

## Chatbot (public)

`/api/chatbot/*` — no auth

### `POST /message`

`chatbotController.sendMessage`:
1. Rate limit ~30 req/min per user (in-memory)
2. OpenAI chat completion with tools from `chatbot/toolDefinitions.js`
3. Tools call DB: listings, availability, booking status, knowledge base, etc. (`chatbot/tools/`)
4. Two-round function calling pattern

### `POST /ticket`

Creates `ChatbotTicket` for human follow-up.

### Admin chatbot tickets

`/api/admin/chatbot-tickets/*` — **no auth** — list, reply, delete.

`POST /api/chatbot-tickets/create` — public widget submission.

---

## Knowledge base

`KnowledgeBase` model exported as `QnA` — categories like `Booking Flow`, `Pricing & Fees`.

Admin CRUD: `/api/admin/qna/*` — **no auth**

Chatbot tool `searchKnowledgeBase` reads active QnAs.

---

## Related

- [reviews-and-claims.md](./reviews-and-claims.md)
- [shared-api.md](../04-api-reference/shared-api.md)
