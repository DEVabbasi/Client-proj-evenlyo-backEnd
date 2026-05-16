const dns = require("dns");
dns.setServers(["1.1.1.1"]);
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    console.log("URI:", process.env.MONGODB_URI);
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10, // 👈 limit to 10 connections
    });
    console.log('✅ Connected to MongoDB Atlas');

    const { ensureAppSettings } = require('../utils/ensureAppSettings');
    await ensureAppSettings();
    console.log('✅ App settings fields synced to database');
    
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
};

module.exports = connectDB;
