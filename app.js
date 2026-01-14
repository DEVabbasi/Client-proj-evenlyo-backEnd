const express = require("express");
const path = require("path");
const i18next = require("i18next");
const Backend = require("i18next-fs-backend");
const i18nextMiddleware = require("i18next-http-middleware");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const cors = require("cors");
const morgan = require("morgan");
const logger = require("./utils/logger");
require("dotenv").config();

/* ==========================
   Database
========================== */
connectDB();

mongoose.connection.on("connected", () =>
  logger.info("Mongoose connected to database")
);
mongoose.connection.on("disconnected", () =>
  logger.warn("Mongoose disconnected from database")
);
mongoose.connection.on("error", (err) =>
  logger.error("Mongoose connection error:", err)
);

/* ==========================
   App init
========================== */
const app = express();
app.set("trust proxy", 1);

/* ==========================
   i18n
========================== */
i18next
  .use(Backend)
  .use(i18nextMiddleware.LanguageDetector)
  .init({
    fallbackLng: "en",
    preload: ["en", "nl"],
    backend: {
      loadPath: path.join(__dirname, "/locales/{{lng}}/translation.json"),
    },
    detection: {
      order: ["querystring", "cookie", "header"],
      caches: ["cookie"],
    },
  });

/* ==========================
   CORS (FINAL)
========================== */
const allowedOrigins = [
  // Local
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  "http://localhost:5174",

  // Firebase
  "https://evenlyo.web.app",
  "https://staging-evenlyo-vendor.web.app",
  "https://evenlyo-admin.web.app",
  "https://staging-evenlyo-admin.web.app",

  // Dev tunnels
  "https://cp5h187s-5173.inc1.devtunnels.ms",
  "https://cp5h187s-3000.inc1.devtunnels.ms",

  // Production
  "https://evenlyo.nl",
  "https://www.evenlyo.nl",
  "https://staging.evenlyo.nl",
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
  ],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* ==========================
   Middleware
========================== */
app.use(
  morgan("combined", {
    stream: { write: (msg) => logger.info(msg.trim()) },
  })
);

app.use(logger.logRequest);

app.use(
  express.json({
    verify: (req, res, buf) => {
      if (req.originalUrl?.startsWith("/api/payments/webhook")) {
        req.rawBody = buf;
      }
    },
  })
);

app.use(cookieParser());
app.use(i18nextMiddleware.handle(i18next));

/* ==========================
   Routes
========================== */

// Client
app.use("/api/auth", require("./routes/auth"));
app.use("/api/categories", require("./routes/client/categories"));
app.use("/api/listings", require("./routes/client/listings"));
app.use("/api/subcategories", require("./routes/client/subcategories"));
app.use("/api/booking", require("./routes/client/bookings"));
app.use("/api/cart", require("./routes/client/cart"));
app.use("/api/plans", require("./routes/client/plans"));
app.use("/api/blogs", require("./routes/client/blogs"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/support", require("./routes/client/support"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/vendor", require("./routes/client/vendors"));
app.use("/api/items", require("./routes/client/Items"));
app.use("/api/client/purchases", require("./routes/client/purchases"));
app.use("/api/faqs", require("./routes/client/faqs"));
app.use("/api", require("./routes/client/saleItemPurchase"));

// Vendor
app.use("/api/vendor/dashboard", require("./routes/vendor/dashboard"));
app.use("/api/vendor/listings", require("./routes/vendor/listings"));
app.use("/api/vendor/bookings", require("./routes/vendor/booking"));
app.use("/api/vendor/tracking", require("./routes/vendor/tracking"));
app.use("/api/vendor/billing", require("./routes/vendor/billing"));
app.use("/api/vendor/profile", require("./routes/vendor/profile"));
app.use("/api/vendor/roles", require("./routes/vendor/role"));
app.use("/api/vendor/earnings", require("./routes/vendor/earnings"));
app.use("/api/vendor/stock", require("./routes/vendor/stock"));
app.use("/api/vendor/items", require("./routes/vendor/items"));
app.use("/api/vendor/itemstock", require("./routes/vendor/itemStock"));

// Admin
app.use("/api/admin/dashboard", require("./routes/admin/dashboard"));
app.use("/api/admin/bookings", require("./routes/admin/bookings"));
app.use("/api/admin/report", require("./routes/admin/report"));
app.use("/api/admin/tracking", require("./routes/admin/tracking"));
app.use("/api/admin/listing", require("./routes/admin/listingsManagement"));
app.use("/api/admin/plans", require("./routes/admin/plans"));
app.use("/api/admin/support", require("./routes/admin/support"));
app.use("/api/admin/settings", require("./routes/admin/settings"));
app.use("/api/admin/blogs", require("./routes/admin/blog"));
app.use("/api/admin/faqs", require("./routes/admin/faqs"));

// Payments
app.use("/api/payments", require("./routes/payments"));

// Chat
app.use("/api/messages", require("./routes/messageRoutes"));
app.use("/api/conversations", require("./routes/conversationRoutes"));
app.use("/api/chatrooms", require("./routes/chatRoomRoutes"));

/* ==========================
   Root
========================== */
app.get("/", (req, res) => {
  res.send(req.t("ok"));
});

/* ==========================
   Error handler
========================== */
app.use((err, req, res, next) => {
  logger.logError(err, req);
  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Internal Server Error",
    timestamp: new Date().toISOString(),
  });
});

module.exports = app;
