const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Vendor = require("../models/Vendor");
const multer = require("multer");
const path = require("path");
const Listing = require("../models/Listing");
const SaleItem = require("../models/Item");
const { getVendorDisplayName } = require("../utils/vendorDisplayName");

// --- Utility function to get user model ---
const getUserData = async (userId, userType) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  if (userType === "vendor") {
    const vendor = await Vendor.findOne({ userId: userId }).populate("userId");
    return vendor || user;
  }

  return user;
};

// --- Personal Information APIs ---

// Get user profile information
const getPersonalInfo = async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.userType;

    const userData = await getUserData(userId, userType);
    const user = userType === "vendor" ? userData.userId : userData;

    res.json({
      success: true,
      data: {
        profileImage: user.profileImage,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        email: user.email,
        contactNumber: user.contactNumber,
        address: user.address || {},
        userType: user.userType,
        language: user.language,
      },
    });
  } catch (error) {
    console.error("Get personal info error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve personal information",
      error: error.message,
    });
  }
};

// Update user profile information
const updatePersonalInfo = async (req, res) => {
  try {
    const userId = req.user.id;
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      req.body,
      { new: true, runValidators: true }
    ).select("-password")
    res.json({
      success: true,
      message: "Personal information updated successfully",
      data: updatedUser
    });
  } catch (error) {
    console.error("Update personal info error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update personal information",
      error: error.message,
    });
  }
};
// const userId = req.user.id;
// const userType = req.user.userType;
// const { contactNumber, address, language, profileImage } = req.body;
// // Validate input
// const updates = {};

// if (contactNumber !== undefined) {
//   if (!contactNumber || contactNumber.trim() === "") {
//     return res.status(400).json({
//       success: false,
//       message: "Contact number cannot be empty",
//     });
//   }
//   updates.contactNumber = contactNumber.trim();
// }
// if (address !== undefined) {
//   if (typeof address !== "object" || !address.fullAddress) {
//     return res.status(400).json({
//       success: false,
//       message:
//         "Invalid address format. Must be an object with a fullAddress field.",
//     });
//   }
//   updates.address = address;
// }

// if (language !== undefined) {
//   if (!["english", "dutch"].includes(language)) {
//     return res.status(400).json({
//       success: false,
//       message: "Invalid language. Must be either english or dutch",
//     });
//   }
//   updates.language = language;
// }

// if (profileImage !== undefined) {
//   console.log("Processing profileImage:", profileImage);

//   // Validate Cloudinary URL format
//   if (
//     profileImage &&
//     typeof profileImage === "string" &&
//     profileImage.trim() !== ""
//   ) {
//     const trimmedUrl = profileImage.trim();
//     console.log("Trimmed URL:", trimmedUrl);

//     // More flexible Cloudinary URL pattern
//     const cloudinaryUrlPattern =
//       /^https?:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\/.*\.(jpg|jpeg|png|gif|webp|svg)$/i;
//     const isValidCloudinaryUrl = cloudinaryUrlPattern.test(trimmedUrl);

//     console.log("URL validation result:", isValidCloudinaryUrl);

//     if (!isValidCloudinaryUrl) {
//       // Also check for basic Cloudinary pattern without file extension requirement
//       const basicCloudinaryPattern =
//         /^https?:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\//i;
//       if (!basicCloudinaryPattern.test(trimmedUrl)) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Invalid Cloudinary URL format. Please provide a valid Cloudinary image URL.",
//         });
//       }
//     }

//     updates.profileImage = trimmedUrl;
//     console.log("Profile image added to updates");
//   } else if (profileImage === "") {
//     updates.profileImage = "";
//     console.log("Profile image set to empty string");
//   } else {
//     console.log(
//       "Invalid profileImage type or value:",
//       typeof profileImage,
//       profileImage
//     );
//     return res.status(400).json({
//       success: false,
//       message:
//         "Profile image must be a valid Cloudinary URL string or an empty string",
//     });
//   }
// }

// // Debug logging
// console.log("Final updates object:", updates);

// if (Object.keys(updates).length === 0) {
//   return res.status(400).json({
//     success: false,
//     message: "No valid fields to update",
//   });
// }



// if (!updatedUser) {
//   return res.status(404).json({
//     success: false,
//     message: "User not found",
//   });
// }



// Change password
const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;

    // Validate required fields
    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Old password and new password are required",
      });
    }

    // Validate new password strength
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters long",
      });
    }

    // Get user from database
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if user has a password (for social login users)
    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: "Cannot change password for social login accounts",
      });
    }

    // Verify old password
    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Check if new password is different from old password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from current password",
      });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password in database
    await User.findByIdAndUpdate(userId, {
      $set: { password: hashedNewPassword },
    });

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to change password",
      error: error.message,
    });
  }
};

// --- Notification Settings APIs ---

// Get notification settings
const getNotificationSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(userId, "userIduserIduserIduserId");
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Initialize notifications if they don't exist
    if (!user.notifications) {
      user.notifications = { email: true, push: true };
      await user.save();
    }

    res.json({
      success: true,
      data: {
        emailNotifications: user.notifications?.email ?? true,
        pushNotifications: user.notifications?.push ?? true,
      },
    });
  } catch (error) {
    console.error("Get notification settings error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve notification settings",
      error: error.message,
    });
  }
};

// Update notification settings
const updateNotificationSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { emailNotifications, pushNotifications } = req.body;

    // Validate input
    const updates = {};

    if (emailNotifications !== undefined) {
      if (typeof emailNotifications !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "emailNotifications must be a boolean value",
        });
      }
      updates["notifications.email"] = emailNotifications;
    }

    if (pushNotifications !== undefined) {
      if (typeof pushNotifications !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "pushNotifications must be a boolean value",
        });
      }
      updates["notifications.push"] = pushNotifications;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No notification settings to update",
      });
    }

    // First, get current user to ensure they exist
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Initialize notifications object if it doesn't exist
    if (!currentUser.notifications) {
      currentUser.notifications = { email: true, push: true };
      await currentUser.save();
    }

    // Update the notifications
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "Failed to update user",
      });
    }

    // Return the updated notification settings
    res.json({
      success: true,
      message: "Notification settings updated successfully",
      data: {
        emailNotifications: updatedUser.notifications?.email ?? true,
        pushNotifications: updatedUser.notifications?.push ?? true,
      },
    });
  } catch (error) {
    console.error("Update notification settings error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update notification settings",
      error: error.message,
    });
  }
};

const getVendorFullData = async (req, res) => {
  try {
    const { vendorId } = req.body;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "vendorId is required",
      });
    }

    const vendor = await Vendor.findOne({ userId: vendorId })
      .populate("userId")
      .populate("mainCategories")
      .populate("subCategories");

    if (!vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    }

    const listings = await Listing.find({ vendor: vendor.userId }).lean();
    // const saleItems = await SaleItem.find({ vendor: vendor.userId }).lean();

    // Business accounts have no firstName/lastName, so User.fullName resolves
    // from the denormalized businessName. The Vendor profile stays the source
    // of truth, so refresh fullName from it here.
    const vendorData = vendor.toObject();
    if (vendorData.userId) {
      vendorData.userId = {
        ...vendorData.userId,
        businessName: vendorData.businessName || "",
        fullName: vendorData.businessName
          ? vendorData.businessName
          : getVendorDisplayName(vendorData.userId, vendorData),
      };
    }

    res.json({
      success: true,
      data: {
        vendorData,
        Listings: listings,
        // SaleItems: saleItems,
      },
    });
  } catch (error) {
    console.error("Get vendor data error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch vendor data",
      error: error.message,
    });
  }
};

module.exports = getVendorFullData;

module.exports = {
  // Personal Information
  getPersonalInfo,
  updatePersonalInfo,

  // Security Details
  changePassword,

  // Notification Settings
  getNotificationSettings,
  updateNotificationSettings,
  getVendorFullData,
};
