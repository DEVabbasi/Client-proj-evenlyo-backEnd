const app = require('./app');
const http = require('http');
const { Server } = require('socket.io');
const chatSocket = require('./sockets/chatSockets');
const logger = require('./utils/logger');
require("./corn/paymentReminder");
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const express = require("express")

// Shared allowed origins
const cors = require('cors');

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:3001',
  'https://evenlyo.web.app',
  'https://staging-evenlyo-vendor.web.app',
  'https://evenlyo-admin.web.app',
  'https://cp5h187s-5173.inc1.devtunnels.ms',
  'https://cp5h187s-3000.inc1.devtunnels.ms',
  'https://evenlyo.nl',
  'https://staging.evenlyo.nl',
  'https://www.evenlyo.nl',
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow server-to-server or Postman
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS not allowed'));
      }
    },
    credentials: true,
  })
);

// ⚠️ MUST be before routes
app.use(express.json());


// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'OPTIONS'], // OPTIONS useful for preflight
    credentials: true,
  }
});

app.set('socketio', io);
// Attach socket logic
chatSocket(io);

server.listen(PORT, () => {
  logger.info(`🚀 Server started on port ${PORT}`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`📝 Logging level: ${process.env.LOG_LEVEL || 'info'}`);
});

// Optional: catch server errors
server.on('error', (err) => {
  logger.error('Server error:', err);
});
