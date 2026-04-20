// chatbot/toolDefinitions.js
module.exports = [
  // ── Tool 1: Check specific listing availability ──────────────────────────
  {
    type: "function",
    function: {
      name: "check_listing_availability",
      description: `Check real-time availability of a SPECIFIC listing/service from the database.
Use this when user asks:
- "Is [specific DJ/venue/service name] available on [date]?"
- "Can I book [name] for [date]?"
- "Is [name] free on [date range]?"
- "Check if [listing] is available"
- "Is [anything] available?" — even if the name seems unusual, always check the DB
This performs a live DB check against actual bookings. Always use instead of guessing.`,
      parameters: {
        type: "object",
        properties: {
          listing_name: {
            type: "string",
            description: "The name or title of the specific listing the user mentioned",
          },
          listing_id: {
            type: "string",
            description: "MongoDB ObjectId if user provides a direct ID",
          },
          date_from: {
            type: "string",
            description: "Start date YYYY-MM-DD format extracted from user message",
          },
          date_to: {
            type: "string",
            description: "End date YYYY-MM-DD. If user gives only one date, same as date_from",
          },
        },
        required: [],
      },
    },
  },

  // ── Tool 2: Search listings by category/subcategory/location ────────────
  {
    type: "function",
    function: {
      name: "search_listings",
      description: `Search available listings/services on Evenlyo from the database.
Use this when:
- User wants to browse or find services ("show me DJs", "find food trucks in Amsterdam")
- User asks what's available in a category
- User wants recommendations for their event type
- User asks for popular services in a specific city
- During event planning when recommending specific services to check out
- User asks about any category or service type by name, even unfamiliar ones`,

      parameters: {
        type: "object",
        properties: {
          category_name: {
            type: "string",
            description: "Main category: 'Entertainment', 'Food', 'Decoration', 'Locations', 'Staff'",
          },
          subcategory_name: {
            type: "string",
            description: "Subcategory like 'DJ', 'Food Truck', 'Photographer', 'Live Band', 'Venue', 'Floral'",
          },
          location: {
            type: "string",
            description: "City name in Netherlands e.g. 'Amsterdam', 'Rotterdam', 'Utrecht', 'Den Haag'",
          },
          date: {
            type: "string",
            description: "Event date YYYY-MM-DD if user wants availability filtering",
          },
          limit: {
            type: "number",
            description: "Max results (default 5, max 8)",
          },
        },
        required: [],
      },
    },
  },

  // ── Tool 3: Get subcategories for a category ─────────────────────────────
  {
    type: "function",
    function: {
      name: "get_subcategories",
      description: `Get all subcategories available under a specific main category.
Use this when:
- User wants to know what types of services are available in a category
- During event planning to show what options exist (e.g. "what entertainment options do you have?")
- User asks "what kind of DJs/decorators/venues do you have?"`,
      parameters: {
        type: "object",
        properties: {
          category_name: {
            type: "string",
            description: "Main category name e.g. 'Entertainment', 'Food & Drinks', 'Decoration & Styling', 'Locations & Party Tents', 'Staff & Services'",
          },
        },
        required: ["category_name"],
      },
    },
  },

  // ── Tool 4: Get vendor details ───────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_vendor_info",
      description: `Get details about a specific vendor from the database.
Use this when user asks:
- "Tell me about [vendor/business name]"
- "What services does [vendor] offer?"
- "What's the rating of [vendor]?"
- "How many events has [vendor] done?"`,
      parameters: {
        type: "object",
        properties: {
          vendor_name: {
            type: "string",
            description: "Business name of the vendor",
          },
          vendor_id: {
            type: "string",
            description: "MongoDB ObjectId if provided",
          },
        },
        required: [],
      },
    },
  },

  // ── Tool 5: Check booking status by tracking ID ─────────────────────────
  {
    type: "function",
    function: {
      name: "get_booking_status",
      description: `Check the real-time status of a booking using its tracking ID from the database.
Use this when:
- User provides a tracking ID and asks about their booking
- "What is the status of booking [tracking ID]?"
- "Check my order [tracking ID]"
- "Has booking [ID] been accepted?"
- Any question referencing a specific tracking ID`,
      parameters: {
        type: "object",
        properties: {
          tracking_id: {
            type: "string",
            description: "The booking tracking ID (looks like TRK-XXXXXXXX or similar)",
          },
        },
        required: ["tracking_id"],
      },
    },
  },
];