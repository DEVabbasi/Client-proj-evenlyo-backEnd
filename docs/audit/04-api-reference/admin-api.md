# API Reference — Admin

**Auth warning:** Many routes listed below have **no middleware**. Routes marked `requireAdmin` are the protected subset.

Flow: [admin-moderation.md](../03-flows/admin-moderation.md)

---

## Dashboard `/api/admin/dashboard`

| GET | `/stats` | requireAdmin | Dashboard statistics |

---

## Users `/api/admin/users` (requireAdmin on all)

| GET | `/clients`, `/clients/:clientId` | List / detail |
| PATCH | `/clients/:clientId/status` | Block/unblock |
| PATCH | `/clients/:clientId/reset-password` | |
| GET | `/vendors`, `/vendors/:vendorId` | |
| PATCH | `/vendors/:vendorId/status` | |
| PATCH | `/vendors/:vendorId/approval` | Approve vendor |
| PATCH | `/vendors/:vendorId/reset-password` | |
| POST | `/clients/send-email`, `/vendors/send-email` | Bulk email |

---

## Bookings `/api/admin/bookings`

| GET | `/analytics` | requireAdmin | |
| GET | `/analytics/filtered` | requireAuth, requireAdmin, requireActiveAdmin | |
| GET | `/:id/details` | requireAuth, requireAdmin, requireActiveAdmin | |

---

## Tracking `/api/admin/tracking` (requireAdmin)

| GET | `/`, `/sale`, `/stats` | All bookings / sale orders / stats |
| GET | `/:trackingId` | By tracking id |
| GET | `/:trackingId/status-history` | History |
| GET | `/booking/:bookingId/status-history` | By booking id |
| PATCH | `/:trackingId/status` | **Manual status override** |

---

## Report `/api/admin/report`

| GET | `/stats-card` | **Public** | Stats cards |

---

## Listing management `/api/admin/listing` (**Public**)

| GET | `/stats` | |
| GET | `/subcategories/:mainCategoryId` | |
| PATCH | `/subcategories/:subCategoryId/toggle` | |
| POST | `/create/subcategories` | |
| PUT | `/edit/subcategories/:subCategoryId` | |

---

## Plans `/api/admin/plans`

| GET | `/` | **Public** | All plans |
| PATCH | `/:id/toggle`, `/:id/discount-toggle` | **Public** | |
| PATCH | `/:id/discount` | requireAuth | Activate discount |

---

## Payments `/api/admin/payments` (**Public**)

| GET | `/` | Payment overview |
| GET | `/:vendorId/payout-orders` | Payout queue |
| GET | `/refund-cases` | Refund cases |
| POST | `/:vendorId/disburse-payments` | Stripe disburse |
| POST | `/vendor-claims` | Handle claims |
| POST | `/refund` | Process refund |

---

## Support `/api/admin/support` (**Public**)

| GET | `/support-tickets` | List tickets |
| POST | `/ticket-status/:ticketId` | Toggle open/closed |
| POST | `/send-email/:ticketId` | `subject`, `message` |

---

## Settings `/api/admin/settings` (requireAdmin)

| POST | `/reset-password` | Admin password |
| GET/POST | `/platform-fees` | Settings singleton fees |
| GET | `/notification` | Admin notification prefs |
| PATCH | `/notification/update` | Toggle push |

---

## Blogs `/api/admin/blogs` (requireAdmin)

| POST | `/create` | |
| PUT | `/update/:id` | |
| DELETE | `/delete/:id` | |

---

## FAQs `/api/admin/faqs` (**Public**)

| POST | `/` | Create |
| GET | `/` | List |
| PUT | `/:id` | Update |
| DELETE | `/:id` | Delete |

---

## Knowledge base `/api/admin/qna` (**Public**)

| POST | `/admin/qna/create` | |
| GET | `/admin/qna/fetch` | |
| GET | `/admin/qna/:id` | |
| PUT | `/admin/qna/update/:id` | |
| DELETE | `/admin/qna/delete/:id` | |
| PATCH | `/admin/qna/toggle/:id` | |

---

## Admin employees `/api` (**Public** except login intent)

| POST | `/create-admin` | |
| POST | `/login-admin` | Login (expected public) |
| POST | `/admin/create-employee` | |
| POST | `/admin/login-employee` | |
| POST | `/admin/forgot-password`, `/verify-otp`, `/reset-password` | |
| GET | `/admin/fetch-employees` | |
| GET | `/:id` | Get employee/designation — **route collision risk** |
| PUT | `/admin/update-employee/:id` | |
| DELETE | `/admin/delete-employee/:id` | |
| POST | `/:id/toggle-status` | |

---

## Admin designations `/api` (**Public**)

| POST | `/admin/create-designation` | |
| GET | `/admin/fetch-designations` | |
| GET | `/:id` | |
| PUT | `/admin/update-designation/:id` | |
| DELETE | `/admin/delete-designation/:id` | |

---

## Chatbot tickets `/api`

| POST | `/chatbot-tickets/create` | **Public** | Widget |
| GET | `/admin/chatbot-tickets` | **Public** | List |
| GET | `/admin/chatbot-tickets/:id` | **Public** | |
| PUT | `/admin/chatbot-tickets/:id/status` | **Public** | |
| DELETE | `/admin/chatbot-tickets/:id` | **Public** | |
| POST | `/admin/chatbot-tickets/:id/reply` | **Public** | |
