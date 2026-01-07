const User = require('../../models/User');
const Vendor = require('../../models/Vendor');
const Booking = require('../../models/Booking');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');

// --- Admin User Management ---
const getAllClients = async (req, res) => {
  try {
    // Parallel queries for better performance
    const [
      activeClients,
      blockedClients,
      totalRegisteredClients,
      clientsData
    ] = await Promise.all([
      // Stats Cards
      User.countDocuments({ userType: 'client', isActive: true }),
      User.countDocuments({ userType: 'client', isActive: false }),
      User.countDocuments({ userType: 'client' }),

      // All clients data with their booking counts
      User.find({ userType: 'client' })
        .select('firstName lastName email contactNumber address isActive createdAt')
        .sort({ createdAt: -1 })
        .lean()
    ]);

    // Get booking counts for each client
    const clientsWithBookings = await Promise.all(
      clientsData.map(async (client) => {
        const totalOrders = await Booking.countDocuments({ userId: client._id });

        return {
          id: client._id,
          clientName: `${client.firstName || ''} ${client.lastName || ''}`.trim(),
          email: client.email,
          address: client.address || 'Not provided',
          contactNumber: client.contactNumber || 'Not provided',
          totalOrders: totalOrders,
          status: client.isActive ? 'Active' : 'Blocked',
          registeredDate: client.createdAt
        };
      })
    );

    // Format stats cards
    const statsCard = {
      ActiveClients: activeClients,
      BlockedClients: blockedClients,
      TotalRegisteredClients: totalRegisteredClients
    };

    // Return user management data
    res.json({
      success: true,
      data: {
        statsCard,
        tableData: clientsWithBookings
      }
    });

  } catch (error) {
    console.error('Get all clients error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch clients data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// --- Block/Unblock Client ---
const toggleClientStatus = async (req, res) => {
  try {
    const { clientId } = req.params;
    const { action } = req.body; // 'block' or 'unblock'

    if (!['block', 'unblock'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Use "block" or "unblock"'
      });
    }

    const client = await User.findOne({ _id: clientId, userType: 'client' });
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Update client status
    client.isActive = action === 'unblock';
    await client.save();

    res.json({
      success: true,
      message: `Client ${action === 'block' ? 'blocked' : 'unblocked'} successfully`,
      data: {
        clientId: client._id,
        clientName: `${client.firstName} ${client.lastName}`,
        status: client.isActive ? 'Active' : 'Blocked'
      }
    });

  } catch (error) {
    console.error('Toggle client status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update client status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// --- Get Client Details ---
const getClientDetails = async (req, res) => {
  try {
    const { clientId } = req.params;

    const client = await User.findOne({ _id: clientId, userType: 'client' })
      .select('firstName lastName email contactNumber address isActive createdAt lastLogin');

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Get client's booking history
    const bookings = await Booking.find({ userId: clientId })
      .select('trackingId status createdAt pricing.totalPrice details.eventLocation')
      .sort({ createdAt: -1 })
      .limit(10);

    // Get booking stats
    const [totalBookings, completedBookings, pendingBookings, totalSpent] = await Promise.all([
      Booking.countDocuments({ userId: clientId }),
      Booking.countDocuments({ userId: clientId, status: 'completed' }),
      Booking.countDocuments({ userId: clientId, status: 'pending' }),
      Booking.aggregate([
        { $match: { userId: client._id, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$pricing.totalPrice' } } }
      ])
    ]);

    const clientDetails = {
      id: client._id,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      contactNumber: client.contactNumber || 'Not provided',
      address: client.address || 'Not provided',
      status: client.isActive ? 'Active' : 'Blocked',
      registeredDate: client.createdAt,
      lastLogin: client.lastLogin,
      bookingStats: {
        totalBookings,
        completedBookings,
        pendingBookings,
        totalSpent: totalSpent[0]?.total || 0
      },
      recentBookings: bookings.map(booking => ({
        trackingId: booking.trackingId,
        status: booking.status,
        amount: booking.pricing?.totalPrice || 0,
        location: booking.details?.eventLocation || 'Not specified',
        date: booking.createdAt
      }))
    };

    res.json({
      success: true,
      data: clientDetails
    });

  } catch (error) {
    console.error('Get client details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch client details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// --- Reset Client Password ---
const resetClientPassword = async (req, res) => {
  try {
    const { clientId } = req.params;
    const { newPassword } = req.body;

    // Validate required fields
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password is required and must be at least 8 characters long'
      });
    }

    // Find the client
    const client = await User.findOne({ _id: clientId, userType: 'client' });
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the client's password
    client.password = hashedPassword;
    await client.save();

    // Send notification email to the client
    try {
      const htmlMessage = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #333; margin: 0;">Evenlyo</h1>
              <p style="color: #666; margin: 5px 0;">Event Management Platform</p>
            </div>

            <h2 style="color: #333; margin-bottom: 20px;">Password Reset Notification</h2>

            <p style="color: #666; margin-bottom: 20px;">Hello ${client.firstName} ${client.lastName},</p>

            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0;">Your password has been reset by an administrator.</p>
              <p style="margin: 10px 0 0 0;">If you did not request this change, please contact support immediately.</p>
            </div>

            <p style="color: #666; font-size: 14px; margin-top: 30px; text-align: center;">
              Best regards,<br>
              Evenlyo Admin Team
            </p>

            <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px;">
                This is an automated message. Please do not reply to this email.
              </p>
            </div>
          </div>
        </div>
      `;

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: client.email,
        subject: '[Evenlyo] Password Reset Notification',
        html: htmlMessage,
        text: `Hello ${client.firstName} ${client.lastName},\n\nYour password has been reset by an administrator.\n\nIf you did not request this change, please contact support immediately.\n\nBest regards,\nEvenlyo Admin Team`
      };

      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      console.error('Failed to send password reset notification email:', emailError);
      // Don't fail the password reset if email fails
    }

    res.json({
      success: true,
      message: 'Client password reset successfully',
      data: {
        clientId: client._id,
        clientName: `${client.firstName} ${client.lastName}`,
        email: client.email
      }
    });

  } catch (error) {
    console.error('Reset client password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset client password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// --- Reset Vendor Password ---
const resetVendorPassword = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { newPassword } = req.body;

    // Validate required fields
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password is required and must be at least 8 characters long'
      });
    }

    // Find the vendor
    const vendor = await User.findOne({ _id: vendorId, userType: 'vendor' });
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // Get vendor profile for business name
    const vendorProfile = await Vendor.findOne({ userId: vendorId });
    const vendorName = vendorProfile?.businessName || `${vendor.firstName} ${vendor.lastName}`;

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the vendor's password
    vendor.password = hashedPassword;
    await vendor.save();

    // Send notification email to the vendor
    try {
      const htmlMessage = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #333; margin: 0;">Evenlyo</h1>
              <p style="color: #666; margin: 5px 0;">Event Management Platform</p>
            </div>

            <h2 style="color: #333; margin-bottom: 20px;">Password Reset Notification</h2>

            <p style="color: #666; margin-bottom: 20px;">Hello ${vendorName},</p>

            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0;">Your password has been reset by an administrator.</p>
              <p style="margin: 10px 0 0 0;">If you did not request this change, please contact support immediately.</p>
            </div>

            <p style="color: #666; font-size: 14px; margin-top: 30px; text-align: center;">
              Best regards,<br>
              Evenlyo Admin Team
            </p>

            <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px;">
                This is an automated message. Please do not reply to this email.
              </p>
            </div>
          </div>
        </div>
      `;

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: vendor.email,
        subject: '[Evenlyo Partner] Password Reset Notification',
        html: htmlMessage,
        text: `Hello ${vendorName},\n\nYour password has been reset by an administrator.\n\nIf you did not request this change, please contact support immediately.\n\nBest regards,\nEvenlyo Admin Team`
      };

      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      console.error('Failed to send password reset notification email:', emailError);
      // Don't fail the password reset if email fails
    }

    res.json({
      success: true,
      message: 'Vendor password reset successfully',
      data: {
        vendorId: vendor._id,
        vendorName: vendorName,
        email: vendor.email
      }
    });

  } catch (error) {
    console.error('Reset vendor password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset vendor password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// --- Admin Vendor Management ---
const getAllVendors = async (req, res) => {
  try {
    // Parallel queries for better performance
    const [
      activeVendors,
      blockedVendors,
      totalRegisteredVendors,
      vendorsData
    ] = await Promise.all([
      // Stats Cards
      User.countDocuments({ userType: 'vendor', isActive: true }),
      User.countDocuments({ userType: 'vendor', isActive: false }),
      User.countDocuments({ userType: 'vendor' }),

      // All vendors data with their booking counts
      User.find({ userType: 'vendor' })
        .select('firstName lastName email contactNumber address isActive createdAt')
        .sort({ createdAt: -1 })
        .lean()
    ]);

    // Get vendor profiles and booking counts for each vendor
    const vendorsWithBookings = await Promise.all(
      vendorsData.map(async (vendorUser) => {
        // Find vendor profile
        const vendorProfile = await Vendor.findOne({ userId: vendorUser._id });
        console.log(vendorProfile, "vendorProfilevendorProfilevendorProfilevendorProfile")
        let totalOrders = 0;
        let businessName = '';
        let approvalStatus = 'pending';

        if (vendorProfile) {
          totalOrders = await Booking.countDocuments({ vendorId: vendorProfile.userId });
          businessName = vendorProfile.businessName || '';
          approvalStatus = vendorProfile.approvalStatus || 'pending';
        }

        return {
          id: vendorUser._id,
          vendorId: vendorProfile?._id || '',
          vendorName: businessName || `${vendorUser.firstName || ''} ${vendorUser.lastName || ''}`.trim(),
          email: vendorUser.email,
          address: vendorUser.address || '',
          contactNumber: vendorUser.contactNumber || '',
          totalOrders: totalOrders,
          status: vendorUser.isActive ? 'Active' : 'Blocked',
          approvalStatus: approvalStatus,
          registeredDate: vendorUser.createdAt
        };
      })
    );

    // Format stats cards
    const statsCard = {
      ActiveVendors: activeVendors,
      BlockedVendors: blockedVendors,
      TotalRegisteredVendors: totalRegisteredVendors
    };

    // Return vendor management data
    res.json({
      success: true,
      data: {
        statsCard,
        tableData: vendorsWithBookings
      }
    });

  } catch (error) {
    console.error('Get all vendors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendors data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// --- Block/Unblock Vendor ---
const toggleVendorStatus = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { action } = req.body; // 'block' or 'unblock'

    if (!['block', 'unblock'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Use "block" or "unblock"'
      });
    }
    console.log(vendorId, "vendorIdvendorIdvendorId");
    const vendor = await User.findOne({ _id: vendorId, userType: 'vendor' });
    console.log(vendor, "vendorvendorvendor");
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // Update vendor status
    vendor.isActive = action === 'unblock';
    await vendor.save();

    res.json({
      success: true,
      message: `Vendor ${action === 'block' ? 'blocked' : 'unblocked'} successfully`,
      data: {
        vendorId: vendor._id,
        vendorName: `${vendor.firstName} ${vendor.lastName}`,
        status: vendor.isActive ? 'Active' : 'Blocked'
      }
    });

  } catch (error) {
    console.error('Toggle vendor status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update vendor status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// --- Approve/Reject Vendor ---
const toggleVendorApproval = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { action } = req.body; // 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Use "approve" or "reject"'
      });
    }

    const vendorUser = await User.findOne({ _id: vendorId, userType: 'vendor' });
    if (!vendorUser) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    const vendorProfile = await Vendor.findOne({ userId: vendorId });
    if (!vendorProfile) {
      return res.status(404).json({
        success: false,
        message: 'Vendor profile not found'
      });
    }

    // Update vendor approval status
    vendorProfile.approvalStatus = action === 'approve' ? 'approved' : 'rejected';
    vendorProfile.isApproved = action === 'approve';
    await vendorProfile.save();

    res.json({
      success: true,
      message: `Vendor ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
      data: {
        vendorId: vendorUser._id,
        vendorName: `${vendorUser.firstName} ${vendorUser.lastName}`,
        approvalStatus: vendorProfile.approvalStatus
      }
    });

  } catch (error) {
    console.error('Toggle vendor approval error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update vendor approval status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// --- Get Vendor Details ---
const getVendorDetails = async (req, res) => {
  try {
    const { vendorId } = req.params;

    const vendorUser = await User.findOne({ _id: vendorId, userType: 'vendor' })
      .select('firstName lastName email contactNumber address isActive createdAt lastLogin');

    if (!vendorUser) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // Get vendor profile
    const vendorProfile = await Vendor.findOne({ userId: vendorId });

    // Get vendor's booking history
    const bookings = vendorProfile ? await Booking.find({ vendorId: vendorProfile._id })
      .select('trackingId status createdAt pricing.totalPrice details.eventLocation')
      .sort({ createdAt: -1 })
      .limit(10) : [];

    // Get booking stats
    const [totalBookings, completedBookings, pendingBookings, totalEarnings] = await Promise.all([
      vendorProfile ? Booking.countDocuments({ vendorId: vendorProfile._id }) : 0,
      vendorProfile ? Booking.countDocuments({ vendorId: vendorProfile._id, status: 'completed' }) : 0,
      vendorProfile ? Booking.countDocuments({ vendorId: vendorProfile._id, status: 'pending' }) : 0,
      vendorProfile ? Booking.aggregate([
        { $match: { vendorId: vendorProfile._id, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$pricing.totalPrice' } } }
      ]) : []
    ]);

    const vendorDetails = {
      id: vendorUser._id,
      firstName: vendorUser.firstName,
      lastName: vendorUser.lastName,
      email: vendorUser.email,
      contactNumber: vendorUser.contactNumber || 'Not provided',
      address: vendorUser.address || 'Not provided',
      status: vendorUser.isActive ? 'Active' : 'Blocked',
      registeredDate: vendorUser.createdAt,
      lastLogin: vendorUser.lastLogin,
      businessInfo: {
        businessName: vendorProfile?.businessName || 'Not provided',
        businessType: vendorProfile?.businessType || 'Not provided',
        approvalStatus: vendorProfile?.approvalStatus || 'pending',
        isApproved: vendorProfile?.isApproved || false
      },
      bookingStats: {
        totalBookings,
        completedBookings,
        pendingBookings,
        totalEarnings: totalEarnings[0]?.total || 0
      },
      recentBookings: bookings.map(booking => ({
        trackingId: booking.trackingId,
        status: booking.status,
        amount: booking.pricing?.totalPrice || 0,
        location: booking.details?.eventLocation || 'Not specified',
        date: booking.createdAt
      }))
    };

    res.json({
      success: true,
      data: vendorDetails
    });

  } catch (error) {
    console.error('Get vendor details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// --- Email Management ---

// Create email transporter
const transporter = nodemailer.createTransport({
  host: "smtp.zoho.eu",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER, // info@evenlyo.nl
    pass: process.env.EMAIL_PASS  // 12-digit app password
  },
  requireTLS: true
});

// Send email to selected clients
const sendEmailToClients = async (req, res) => {
  try {
    const { clientIds, subject, message, emailType = 'general' } = req.body;

    // Validate required fields
    if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Client IDs array is required'
      });
    }

    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Subject and message are required'
      });
    }

    // Get client details
    const clients = await User.find({
      _id: { $in: clientIds },
      userType: 'client',
      isActive: true
    }).select('firstName lastName email');

    if (clients.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active clients found with provided IDs'
      });
    }

    // Send emails
    const emailResults = await Promise.allSettled(
      clients.map(async (client) => {
        const htmlMessage = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #333; margin: 0;">Evenlyo</h1>
                <p style="color: #666; margin: 5px 0;">Event Management Platform</p>
              </div>
              
              <h2 style="color: #333; margin-bottom: 20px;">Hello ${client.firstName} ${client.lastName},</h2>
              
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
                ${message.replace(/\n/g, '<br>')}
              </div>
              
              <p style="color: #666; font-size: 14px; margin-top: 30px; text-align: center;">
                Best regards,<br>
                Evenlyo Admin Team
              </p>
              
              <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
                <p style="color: #999; font-size: 12px;">
                  This email was sent by Evenlyo admin. If you have any questions, please contact support.
                </p>
              </div>
            </div>
          </div>
        `;

        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: client.email,
          subject: `[Evenlyo] ${subject}`,
          html: htmlMessage,
          text: `Hello ${client.firstName} ${client.lastName},\n\n${message}\n\nBest regards,\nEvenlyo Admin Team`
        };

        try {
          const result = await transporter.sendMail(mailOptions);
          return { success: true, email: client.email, clientName: `${client.firstName} ${client.lastName}` };
        } catch (emailError) {
          return { success: false, email: client.email, error: emailError.message };
        }
      })
    );

    // Process results
    const successfulEmails = [];
    const failedEmails = [];

    emailResults.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.success) {
        successfulEmails.push(result.value);
      } else {
        const error = result.status === 'rejected' ? result.reason : result.value;
        failedEmails.push(error);
      }
    });

    res.json({
      success: true,
      message: `Emails sent successfully`,
      data: {
        totalRecipients: clients.length,
        successfulSends: successfulEmails.length,
        failedSends: failedEmails.length,
        results: [...successfulEmails, ...failedEmails.map(err => ({
          success: false,
          email: err.email || 'unknown',
          error: err.error || err.message || 'Unknown error'
        }))]
      }
    });

  } catch (error) {
    console.error('Send email to clients error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send emails to clients',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Send email to selected vendors
const sendEmailToVendors = async (req, res) => {
  try {
    const { vendorIds, subject, message, emailType = 'general' } = req.body;

    // Validate required fields
    if (!vendorIds || !Array.isArray(vendorIds) || vendorIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vendor IDs array is required'
      });
    }

    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Subject and message are required'
      });
    }

    // Get vendor details
    const vendors = await User.find({
      _id: { $in: vendorIds },
      userType: 'vendor',
      isActive: true
    }).select('firstName lastName email');

    if (vendors.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active vendors found with provided IDs'
      });
    }

    // Get vendor business names
    const vendorsWithBusinessInfo = await Promise.all(
      vendors.map(async (vendor) => {
        const vendorProfile = await Vendor.findOne({ userId: vendor._id }).select('businessName');
        return {
          ...vendor.toObject(),
          businessName: vendorProfile?.businessName || ''
        };
      })
    );

    // Send emails
    const emailResults = await Promise.allSettled(
      vendorsWithBusinessInfo.map(async (vendor) => {
        const vendorName = vendor.businessName || `${vendor.firstName} ${vendor.lastName}`;

        const htmlMessage = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #333; margin: 0;">Evenlyo</h1>
                <p style="color: #666; margin: 5px 0;">Event Management Platform</p>
              </div>
              
              <h2 style="color: #333; margin-bottom: 20px;">Hello ${vendorName},</h2>
              
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
                ${message.replace(/\n/g, '<br>')}
              </div>
              
              <p style="color: #666; font-size: 14px; margin-top: 30px; text-align: center;">
                Best regards,<br>
                Evenlyo Admin Team
              </p>
              
              <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
                <p style="color: #999; font-size: 12px;">
                  This email was sent by Evenlyo admin. If you have any questions, please contact support.
                </p>
              </div>
            </div>
          </div>
        `;

        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: vendor.email,
          subject: `[Evenlyo Partner] ${subject}`,
          html: htmlMessage,
          text: `Hello ${vendorName},\n\n${message}\n\nBest regards,\nEvenlyo Admin Team`
        };

        try {
          const result = await transporter.sendMail(mailOptions);
          return { success: true, email: vendor.email, vendorName };
        } catch (emailError) {
          return { success: false, email: vendor.email, error: emailError.message };
        }
      })
    );

    // Process results
    const successfulEmails = [];
    const failedEmails = [];

    emailResults.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.success) {
        successfulEmails.push(result.value);
      } else {
        const error = result.status === 'rejected' ? result.reason : result.value;
        failedEmails.push(error);
      }
    });

    res.json({
      success: true,
      message: `Emails sent successfully`,
      data: {
        totalRecipients: vendors.length,
        successfulSends: successfulEmails.length,
        failedSends: failedEmails.length,
        results: [...successfulEmails, ...failedEmails.map(err => ({
          success: false,
          email: err.email || 'unknown',
          error: err.error || err.message || 'Unknown error'
        }))]
      }
    });

  } catch (error) {
    console.error('Send email to vendors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send emails to vendors',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getAllClients,
  toggleClientStatus,
  getClientDetails,
  resetClientPassword,
  getAllVendors,
  toggleVendorStatus,
  toggleVendorApproval,
  getVendorDetails,
  resetVendorPassword,
  sendEmailToClients,
  sendEmailToVendors
};
