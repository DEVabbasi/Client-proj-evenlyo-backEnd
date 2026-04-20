require("dotenv").config();
const app = require('./app');
const http = require('http');
const { Server } = require('socket.io');
const chatSocket = require('./sockets/chatSockets');
const logger = require('./utils/logger');
require('./corn/paymentReminder');
const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Allowed origins (used ONLY for socket.io)
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
  'https://staging.vendor.evenlyo.nl',
  'https://www.evenlyo.nl',
  'https://www.staging.evenlyo.nl',
  'https://vendor.evenlyo.nl',
  'https://admin.evenlyo.nl',
  "https://www.admin.evenlyo.nl",
  "https://www.vendor.evenlyo.nl"
];

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  },
});

// Make io available to routes/controllers
app.set('socketio', io);

// Attach socket handlers
chatSocket(io);

// Start server
server.listen(PORT, () => {
  logger.info(`🚀 Server started on port ${PORT}`);
  logger.info(`🌍 Environment: OK ${process.env.NODE_ENV || 'development'}`);
  logger.info(`📝 Logging level: ${process.env.LOG_LEVEL || 'info'}`);
});

// Catch server errors
server.on('error', (err) => {
  logger.error('❌ Server error:', err);
});
