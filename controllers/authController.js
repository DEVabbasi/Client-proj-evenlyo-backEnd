const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Vendor = require("../models/Vendor");
const Admin = require("../models/Admin");
const Employee = require("../models/Employee");
const AdminEmployee = require("../models/AdminEmployee");
const VendorDesignations = require("../models/vendorDesignations");
const {
  generateAndSendOTP,
  verifyOTP,
  generateAndSendOTPonRegister,
} = require("../utils/otpUtils");
const { auth } = require("../config/firebase");
const { signAccessToken, signToken } = require("../utils/jwtUtils");
const logger = require("../utils/logger");
const notificationController = require("./notificationController");
const stripe = require("../config/stripe");

// --- Model loading utility ---
const getModelByUserType = (userType) => {
  switch (userType) {
    case "client":
      return User;
    case "vendor":
      return Vendor;
    case "admin":
      return Admin;
    default:
      throw new Error("Invalid user type");
  }
};

// --- Client Login ---
const clientLogin = async (req, res) => {
  try {
    const { email, password, provider, fcm } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Find user
    const user = await User.findOne({ email, isActive: true, userType: "client" });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Account not found",
      });
    }

    // --- GOOGLE LOGIN ---
    if (provider === "google") {
      if (user.provider !== "google") {
        return res.status(403).json({
          success: false,
          message:
            "This email is registered with password. Please login using email/password.",
        });
      }

      // Update FCM token if provided
      if (fcm) {
        user.fcm = fcm;
        await user.save();
      }

      const token = signToken({
        id: user._id,
        name: user.name,
      });

      return res.json({
        success: true,
        message: "Google login successful",
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          profileImage: user.profileImage,
          userType: "client",
          fcm: user.fcm || null,
        },
      });
    }

    // --- EMAIL LOGIN ---
    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required for email login",
      });
    }

    if (user.provider === "google") {
      return res.status(403).json({
        success: false,
        message:
          "This account was created with Google. Please login using Google.",
      });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Update FCM token if provided
    if (fcm) {
      user.fcm = fcm;
      await user.save();
    }

    const token = signToken({
      id: user._id,
      name: user.name,
    });

    return res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profileImage: user.profileImage,
        userType: "client",
        fcm: user.fcm || null,
      },
    });
  } catch (err) {
    console.error("Client Login Error:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// --- Vendor Login ---
// const vendorLogin = async (req, res) => {
//   try {
//     const { email, password, provider, fcm } = req.body; // fcm added
//     if (!email) {
//       return res.status(400).json({
//         success: false,
//         message: "Email is required",
//       });
//     }

//     let user = await User.findOne({ email });
//     let isEmployee = false;
//     console.log(user, "useruseruseruser");

//     if (!user) {
//       user = await Employee.findOne({ email }).populate("vendor");
//       console.log(user, "USERRRR");

//       if (!user) {
//         return res.status(401).json({
//           success: false,
//           message: "Account not found",
//         });
//       }
//       isEmployee = true;
//     }

//     if (!user.isActive) {
//       return res.status(400).json({
//         success: false,
//         message: "Account not active! Please contact support",
//       });
//     }

//     // --- GOOGLE LOGIN ---
//     if (provider === "google") {
//       if (user.provider && user.provider !== "google") {
//         return res.status(403).json({
//           success: false,
//           message:
//             "This email is registered with password. Please login using email/password.",
//         });
//       }

//       // Update FCM token if provided
//       if (fcm) {
//         user.fcm = fcm;
//         await user.save();
//       }

//       const token = signToken({
//         id: user.createdById != null ? user.createdById : user._id,
//         name: user.name,
//       });

//       const responseUser = {
//         id: user._id,
//         firstName: user.firstName,
//         lastName: user.lastName,
//         email: user.email,
//         profileImage: user.profileImage,
//         userType: "customer",
//         vendorId: isEmployee ? user.vendorId?._id : null,
//         fcm: user.fcm || null,
//       };

//       return res.json({
//         success: true,
//         message: "Google login successful",
//         token,
//         user: responseUser,
//       });
//     }

//     // --- EMAIL LOGIN ---
//     if (!password) {
//       return res.status(400).json({
//         success: false,
//         message: "Password is required for email login",
//       });
//     }

//     if (user.provider === "google") {
//       return res.status(403).json({
//         success: false,
//         message:
//           "This account was created with Google. Please login using Google.",
//       });
//     }

//     // Compare password
//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) {
//       return res.status(401).json({
//         success: false,
//         message: "Invalid email or password",
//       });
//     }

//     // Update FCM token if provided
//     if (fcm) {
//       user.fcm = fcm;
//       await user.save();
//     }

//     let pages = [];
//     let vendorId = null;
//     const vendor = await Vendor.findOne({ userId: user._id }).populate(
//       "userId",
//       "-password",
//     );
//     vendorId = vendor?._id;

//     const designation = await VendorDesignations.findOne({
//       vendorId: isEmployee ? user.vendor.id : user.createdById,
//     });
//     pages = designation?.permissions?.map((p) => p.module) || [];

//     const token = signToken({
//       id: isEmployee ? user.vendor.id : user._id,
//       name: user.name,
//     });

//     const vendorDetails = await Vendor.findOne({ userId: user._id });

//     const responseUser = {
//       id: isEmployee ? user.vendor.id : user._id,
//       firstName: user.firstName,
//       lastName: user.lastName,
//       email: user.email,
//       profileImage: user.profileImage,
//       userType: "vendor",
//       vendorId,
//       vendorDetails,
//       fcm: user.fcm || null, // Include FCM token in response
//     };

//     if (pages.length > 0) {
//       responseUser.pages = pages;
//     }

//     return res.json({
//       success: true,
//       message: "Login successful",
//       token,
//       user: responseUser,
//     });
//   } catch (err) {
//     console.error("Vendor Login Error:", err);
//     res.status(500).json({
//       success: false,
//       message: "Internal server error",
//     });
//   }
// };

// --- Client Registration ---
const registerClient = async (req, res) => {
  return verifyOtpAndRegister(req, res, "client");
};

// --- Admin Login ---
const performAdminLogin = async (req, res) => {
  // ...existing code for performLogin with userType 'admin'...
  return performLogin(req, res, "admin");
};

// Helper to build JWT access token only (refresh tokens disabled)
const buildAccessToken = (userDoc, extra = {}) => {
  return signAccessToken({
    id: userDoc._id,
    email: userDoc.email,
    userType: userDoc.userType,
    firstName: userDoc.firstName,
    lastName: userDoc.lastName,
    ...extra,
  });
};

const performLogin = async (req, res, userType) => {
  exports.loginAdmin = async (req, res) => {
    try {
      const { email, password, provider } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required",
        });
      }

      // Find admin
      const user = await User.findOne({ email, isActive: true });
      if (!user) {
        return res.status(401).json({
          success: false,
          message: {
            en: "Account not found",
            nl: "Account niet gevonden",
          },
        });
      }

      // --- GOOGLE LOGIN ---
      if (provider === "google") {
        if (user.provider !== "google") {
          return res.status(403).json({
            success: false,
            message:
              "This email is registered with password. Please login using email/password.",
          });
        }

        // ✅ Google login success
        const token = signToken({
          id: user._id,
          name: user.name,
        });
        console.log(user, "useruseruseruseruser");

        return res.json({
          success: true,
          message: "Google login successful",
          token,
          admin: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            profileImage: user.profileImage,
            role: "admin",
          },
        });
      }

      // --- EMAIL LOGIN ---
      if (!password) {
        return res.status(400).json({
          success: false,
          message: "Password is required for email login",
        });
      }

      if (user.provider === "google") {
        return res.status(403).json({
          success: false,
          message:
            "This account was created with Google. Please login using Google.",
        });
      }

      // Compare password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      const token = signToken({
        id: user._id,
        name: user.name,
      });

      return res.json({
        success: true,
        message: "Login successful",
        token,
        admin: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          profileImage: user.profileImage,
          role: "admin",
        },
      });
    } catch (err) {
      console.error("Admin Login Error:", err);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };

  // try {
  //   const { email, password } = req.body;

  //   // Validate required fields
  //   if (!email || !password) {
  //     return res.status(400).json({
  //       success: false,
  //       message: 'Email and password are required'
  //     });
  //   }
  //   // Removed super admin environment variable login logic

  //   // Get appropriate model
  //   const UserModel = getModelByUserType(userType);

  //   let user;
  //   let userData;

  //   if (userType === 'client') {
  //     // For clients, search directly in User model
  //     user = await User.findOne({ email, userType: 'client', isActive: true });
  //     userData = user;
  //   } else if (userType === 'vendor') {
  //     // For vendors: first try Vendor user account, else try Employee (role user) login
  //     user = await User.findOne({ email, userType: 'vendor', isActive: true });
  //     let employeeLogin = false;
  //     let employee = null;
  //     if (user) {
  //       userData = await Vendor.findOne({ userId: user._id }).populate('userId');
  //     } else {
  //       // Try employee (role user) login
  //       employee = await require('../models/Employee').findOne({ email, status: 'active' }).populate('designation');
  //       if (employee) {
  //         employeeLogin = true;
  //         // Build a user-like object for token creation
  //         user = {
  //           _id: employee._id,
  //           email: employee.email,
  //           userType: 'vendor',
  //           firstName: employee.firstName,
  //           lastName: employee.lastName
  //         };
  //         // Load vendor profile for extra data
  //         userData = await Vendor.findById(employee.vendor).populate('userId');
  //       }
  //     }
  //     // attach flags for later checks
  //     user && (user._isEmployeeLogin = !!employeeLogin);
  //     user && (user._employeeDoc = employee);
  //   } else if (userType === 'admin') {
  //     // For admins, try the normal admin user account first
  //     user = await User.findOne({ email, userType: 'admin', isActive: true });
  //     let adminEmployeeLogin = false;
  //     let adminEmployee = null;
  //     if (user) {
  //       userData = await Admin.findOne({ userId: user._id }).populate('userId');
  //     } else {
  //       // Try admin employee login
  //       adminEmployee = await require('../models/AdminEmployee').findOne({ email, status: 'active' }).populate('designation');
  //       if (adminEmployee) {
  //         adminEmployeeLogin = true;
  //         user = {
  //           _id: adminEmployee._id,
  //           email: adminEmployee.email,
  //           userType: 'admin',
  //           firstName: adminEmployee.firstName,
  //           lastName: adminEmployee.lastName
  //         };
  //         // Build userData as admin root info if needed
  //         userData = { role: 'admin', permissions: adminEmployee.designation ? adminEmployee.designation.permissions.map(p => p.module) : [], department: 'operations' };
  //       }
  //     }
  //     user && (user._isAdminEmployeeLogin = !!adminEmployeeLogin);
  //     user && (user._adminEmployeeDoc = adminEmployee);
  //   }

  //   // Check if user exists
  //   if (!user || !userData) {
  //     return res.status(401).json({
  //       success: false,
  //       message: 'Invalid credentials'
  //     });
  //   }

  //   // Check if user is a social login user trying to login with password
  //   if (user.provider === 'google') {
  //     return res.status(400).json({
  //       success: false,
  //       message: 'This account uses Google Sign-In. Please use Google authentication.'
  //     });
  //   }

  //   // Verify password
  //   let isPasswordValid = false;
  //   // Determine which stored hash to use (vendor employee, admin employee, or main user)
  //   let storedHash;
  //   if (user._isEmployeeLogin && user._employeeDoc) {
  //     storedHash = user._employeeDoc.password;
  //   } else if (user._isAdminEmployeeLogin && user._adminEmployeeDoc) {
  //     storedHash = user._adminEmployeeDoc.password;
  //   } else {
  //     storedHash = user.password;
  //   }

  //   // If stored hash is missing, fail fast with invalid credentials
  //   if (!storedHash) {
  //     logger.warn('Login attempt with missing password hash', { email: user && user.email });
  //     return res.status(401).json({ success: false, message: 'Invalid credentials' });
  //   }

  //   isPasswordValid = await bcrypt.compare(password, storedHash);
  //   if (!isPasswordValid) {
  //     return res.status(401).json({
  //       success: false,
  //       message: 'Invalid credentials'
  //     });
  //   }

  //   // Additional checks for admin
  //   if (userType === 'admin') {
  //     // If admin employee login, check the AdminEmployee.status instead of userData
  //     if (user._isAdminEmployeeLogin && user._adminEmployeeDoc) {
  //       if (user._adminEmployeeDoc.status !== 'active') {
  //         return res.status(403).json({ success: false, message: 'Account is deactivated. Please contact support.' });
  //       }
  //     } else {
  //       if (userData && userData.isActive === false) {
  //         return res.status(403).json({
  //           success: false,
  //           message: 'Account is deactivated. Please contact support.'
  //         });
  //       }
  //     }
  //   }

  //   // Update last login for User model if present
  //   try {
  //     if (!user._isEmployeeLogin && user.save) {
  //       user.lastLogin = new Date();
  //       await user.save({ validateBeforeSave: false });
  //     }
  //     // Vendor profile lastLogin not tracked consistently; skip if not present
  //   } catch (e) {
  //     // non-fatal
  //     logger.warn('Could not update lastLogin', { error: e.message || e });
  //   }

  //   // Determine extra props for token
  //   const extraPayload = {};
  //   if (userType === 'admin') {
  //     extraPayload.role = userData.role;
  //     extraPayload.permissions = userData.permissions;
  //     extraPayload.department = userData.department;
  //   } else if (userType === 'vendor') {
  //     // If this was an employee login, include employee-specific payload
  //     if (user._isEmployeeLogin && user._employeeDoc) {
  //       const emp = user._employeeDoc;
  //       extraPayload.vendorId = emp.vendor;
  //       extraPayload.employeeId = emp._id;
  //       extraPayload.designation = emp.designation ? emp.designation.name : undefined;
  //     } else {
  //       extraPayload.businessName = userData.businessName;
  //       extraPayload.approvalStatus = userData.approvalStatus;
  //       extraPayload.vendorId = userData._id;
  //     }
  //   }

  //   const accessToken = buildAccessToken(user, extraPayload);

  //   // Return success response
  //   // Build response user object, include pages for employee role-users
  //   const responseUser = {
  //     id: user._id,
  //     email: user.email,
  //     firstName: user.firstName,
  //     lastName: user.lastName,
  //     userType: user.userType
  //   };

  //   if (userType === 'admin') {
  //     if (user._isAdminEmployeeLogin && user._adminEmployeeDoc) {
  //       const admEmp = user._adminEmployeeDoc;
  //       responseUser.designation = admEmp.designation ? admEmp.designation.name : null;
  //       responseUser.pages = Array.isArray(admEmp.designation?.permissions)
  //         ? admEmp.designation.permissions.map(p => p.module)
  //         : [];
  //       responseUser.status = admEmp.status;
  //     } else {
  //       responseUser.role = userData.role;
  //       responseUser.permissions = userData.permissions;
  //       responseUser.department = userData.department;
  //     }
  //   }

  //   if (userType === 'vendor') {
  //     if (user._isEmployeeLogin && user._employeeDoc) {
  //       const emp = user._employeeDoc;
  //       responseUser.designation = emp.designation ? emp.designation.name : null;
  //       // pages: array of permission module names
  //       responseUser.pages = Array.isArray(emp.designation?.permissions)
  //         ? emp.designation.permissions.map(p => p.module)
  //         : [];
  //       responseUser.vendorId = emp.vendor;
  //       responseUser.employeeId = emp._id;
  //     } else {
  //       responseUser.businessName = userData.businessName;
  //       responseUser.approvalStatus = userData.approvalStatus;
  //       responseUser.vendorId = userData._id;
  //     }
  //   }

  //   res.json({
  //     success: true,
  //     message: 'Login successful',
  //     tokens: { access: accessToken },
  //     user: responseUser
  //   });

  // } catch (error) {
  //   logger.error('Login error', { error: error.message, stack: error.stack });
  //   res.status(500).json({
  //     success: false,
  //     message: 'Internal server error',
  //     error: process.env.NODE_ENV === 'development' ? error.message : undefined
  //   });
  // }
};

// Admin Login
const adminLogin = performAdminLogin;
// --- Logout (stateless) ---
const logout = async (_req, res) => {
  // Client should discard JWT. No server state to clear.
  res.json({
    success: true,
    message: "Logged out (stateless). Discard your token client-side.",
  });
};

// --- Get Current User ---
const getCurrentUser = async (req, res) => {
  try {
    // Prefer req.user (set by requireAuth with JWT) else fallback to legacy session
    const base = req.user || req.session?.user;
    if (!base) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    const { id, userType } = base;
    let responseUser = {
      id,
      email: base.email,
      firstName: base.firstName,
      lastName: base.lastName,
      userType,
    };

    if (userType === "client") {
      const userData = await User.findById(id).select("-password");
      if (!userData)
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
    } else if (userType === "vendor") {
      // If token belongs to an Employee (vendor role-user), resolve via Employee
      if (
        base._isEmployee ||
        base._isEmployeeLogin ||
        base._isEmployeeLogin === true
      ) {
        const Employee = require("../models/Employee");
        const employee =
          await Employee.findById(id).populate("designation vendor");
        if (!employee)
          return res
            .status(404)
            .json({ success: false, message: "Employee profile not found" });
        responseUser.designation = employee.designation
          ? employee.designation.name
          : null;
        responseUser.pages = Array.isArray(employee.designation?.permissions)
          ? employee.designation.permissions.map((p) => p.module)
          : [];
        responseUser.vendorId =
          employee.vendor && employee.vendor._id
            ? employee.vendor._id
            : employee.vendor;
        responseUser.businessName = employee.vendor
          ? employee.vendor.businessName
          : undefined;
        responseUser.approvalStatus = employee.vendor
          ? employee.vendor.approvalStatus
          : undefined;
      } else {
        const vendor = await Vendor.findOne({ userId: id }).populate(
          "userId",
          "-password",
        );
        if (!vendor)
          return res
            .status(404)
            .json({ success: false, message: "Vendor profile not found" });
        responseUser.businessName = vendor.businessName;
        responseUser.approvalStatus = vendor.approvalStatus;
        responseUser.vendorId = vendor._id;
      }
    } else if (userType === "admin") {
      if (id === "superadmin") {
        responseUser.role = "super_admin";
        responseUser.permissions = ["*"];
        responseUser.department = "Administration";
      } else if (
        base._isAdminEmployee ||
        base._isAdminEmployeeLogin ||
        base._isAdminEmployee === true
      ) {
        // Admin employee token - resolve AdminEmployee
        const AdminEmployee = require("../models/AdminEmployee");
        const admEmp = await AdminEmployee.findById(id).populate("designation");
        if (!admEmp)
          return res
            .status(404)
            .json({ success: false, message: "Admin profile not found" });
        responseUser.designation = admEmp.designation
          ? admEmp.designation.name
          : null;
        responseUser.pages = Array.isArray(admEmp.designation?.permissions)
          ? admEmp.designation.permissions.map((p) => p.module)
          : [];
        // AdminEmployee model doesn't have role/department fields - expose as admin-level employee
        responseUser.role = "admin";
        responseUser.permissions = responseUser.pages;
      } else {
        const admin = await Admin.findOne({ userId: id }).populate(
          "userId",
          "-password",
        );
        if (!admin)
          return res
            .status(404)
            .json({ success: false, message: "Admin profile not found" });
        responseUser.role = admin.role;
        responseUser.permissions = admin.permissions;
        responseUser.department = admin.department;
      }
    }

    res.json({ success: true, user: responseUser });
  } catch (error) {
    console.error("Get current user error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// --- Registration OTP endpoints ---
const sendOtpForRegister = async (req, res) => {
  try {
    let { email } = req.body;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }
    email = String(email).trim().toLowerCase();
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      // If the account uses social login, guide the user accordingly
      if (existingUser.provider && existingUser.provider !== "email") {
        return res.status(409).json({
          success: false,
          message: {
            en: `An account with this email already exists and uses ${existingUser.provider} sign-in. Please use the social provider to sign in.`,
            nl: `Een account met deze e-mail bestaat al en gebruikt ${existingUser.provider} inloggen. Gebruik de sociale provider om in te loggen.`,
          }
        });
      }
      return res.status(409).json({
        success: false,
        message:
        {
          en: "Email is already registered. Please login or use password reset if you forgot your password.",
          nl: "Email is al geregistreerd. Log in of gebruik wachtwoord reset als je je wachtwoord bent vergeten.",
        }
      });
    }
    await generateAndSendOTPonRegister(email);
    res.json({
      success: true,
      message: {
        en: "OTP sent to email",
        nl: "OTP verzonden naar e-mail",
      },
    });
  } catch (err) {
    console.error("Send OTP error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
};

const verifyOtpAndRegister = async (req, res, userType = "client") => {
  try {
    const {
      firstName,
      lastName,
      email,
      contactNumber,
      address,
      password,
      confirmPassword,
      otp,
    } = req.body;

    if (
      !firstName ||
      !lastName ||
      !email ||
      !contactNumber ||
      !address ||
      !password ||
      !confirmPassword ||
      !otp
    ) {
      return res.status(400).json({
        success: false,
        message:
          "All fields including password confirmation and OTP are required",
      });
    }

    // Validate password confirmation
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Password and confirm password do not match",
      });
    }

    // Validate userType for registration
    if (!["client", "vendor"].includes(userType)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid userType. Registration only available for client or vendor",
      });
    }

    // Currently only client registration is implemented
    if (userType === "vendor") {
      return res.status(400).json({
        success: false,
        message:
          "Vendor registration is not yet implemented. Please use client registration.",
      });
    }

    // Verify OTP
    const valid = await verifyOTP(email, otp);
    if (!valid) {
      return res.status(400).json({
        success: false,
        message: {
          en: "Invalid or expired OTP",
          nl: "Ongeldige of verlopen OTP",
        }
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      firstName,
      lastName,
      email,
      contactNumber,
      address: address || "",
      password: hashedPassword,
      userType,
      isActive: true,
    });

    await user.save();

    // Notify admin(s) of new client registration
    const adminsToNotify = await AdminEmployee.findOne({
      role: "Admin",
      status: "active",
      "notificationSettings.push.newRegistration": true
    }).select("_id name email");

    console.log(adminsToNotify, "adminsToNotifyadminsToNotifyadminsToNotify");


    if (adminsToNotify) {
      await notificationController.createNotification({
        title: {
          en: "New User Registration",
          nl: "Nieuwe gebruikersregistratie"
        },
        notificationFor: "Admin",
        vendorId: null, // vendor's user account receives notification
        clientId: user._id, // vendor's user account receives notification
        bookingId: null,
        message: {
          en: `A new user has registered: ${firstName} ${lastName}`,
          nl: `Een nieuwe gebruiker heeft zich geregistreerd: ${firstName} ${lastName}`,
        },
      });
    }
    // try {
    //   const notificationController = require("./notificationController");
    //   await notificationController.createAdminNotification({
    //     message: `A new client has registered: ${firstName} ${lastName}`,
    //   });
    // } catch (e) {
    //   console.error(
    //     "Failed to create admin notification for new client registration:",
    //     e
    //   );
    // }

    // Future: Create role-specific profile if vendor
    // if (userType === 'vendor') {
    //   // Vendor profile creation logic will be implemented here
    // }

    const successMessage =
      userType === "vendor"
        ? {
          en: "Vendor registration successful. Your account is pending approval.",
          nl: "Registratie succesvol. Uw account wacht op goedkeuring.",
        }
        : {
          en: "Client registration successful",
          nl: "Registratie succesvol"
        }

    res.status(201).json({
      success: true,
      message: successMessage,
    });
  } catch (err) {
    console.error("Verify OTP/Register error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// --- Forgot Password OTP endpoints ---
const sendOtpForForgotPassword = async (req, res) => {
  try {
    let { email, type } = req.body;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Normalize email to avoid case-sensitivity issues
    email = String(email).trim().toLowerCase();

    // Check if user exists and is active
    const user = await User.findOne({ email });
    if (!user) {
      // Do NOT send OTP when user does not exist for forgot-password flow
      return res.status(404).json({
        success: false,
        message: "No account found with this email",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is deactivated. Please contact support.",
      });
    }

    // Prevent sending OTP to social login users
    if (user.provider && user.provider !== "email") {
      return res.status(400).json({
        success: false,
        message:
          "This account uses social login. Password reset via email is not available. Please use the social provider to sign in.",
      });
    }

    await generateAndSendOTP(email);
    res.json({
      success: true,
      message: {
        en: "OTP sent to email",
        nl: "OTP verzonden naar e-mail",
      }
    });
  } catch (err) {
    console.error("Send OTP (forgot) error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
};

const {
  signPasswordResetToken,
  verifyPasswordResetToken,
} = require("../utils/jwtUtils");
const { log } = require("winston");

const verifyOtpForForgotPassword = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    // Check if user exists and is not a social login user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email",
      });
    }

    if (user.provider === "google") {
      return res.status(400).json({
        success: false,
        message:
        {
          en: "This account uses Google Sign-In. Password reset is not available for social login accounts.",
          nl: "Dit account gebruikt Google Sign-In. Wachtwoord reset is niet beschikbaar voor social login accounts.",
        }
      });
    }

    const valid = await verifyOTP(email, otp);
    if (!valid) {
      return res.status(400).json({
        success: false,
        message: {
          en: "Invalid or expired OTP",
          nl: "Ongeldige of verlopen OTP",
        }
      });
    }

    // Issue short-lived password reset token
    const resetToken = signPasswordResetToken({ email });

    res.json({
      success: true,
      message: {
        en: "OTP verified. You may now reset your password.",
        nl: "OTP geverifieerd. U kunt nu uw wachtwoord opnieuw instellen.",
      },
      resetToken,
    });
  } catch (err) {
    console.error("Verify OTP (forgot) error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { password, resetToken } = req.body;

    if (!resetToken) {
      return res
        .status(400)
        .json({ success: false, message: "Reset token is required" });
    }
    if (!password) {
      return res
        .status(400)
        .json({ success: false, message: "Password is required" });
    }

    let decoded;
    try {
      decoded = verifyPasswordResetToken(resetToken);
    } catch (e) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired reset token" });
    }

    const email = decoded.email;
    const user = await User.findOne({ email });
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    if (user.provider === "google") {
      return res.status(400).json({
        success: false,
        message: "Google sign-in accounts cannot reset password this way.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({
      success: true, message: {
        en: "Password reset successfully",
        nl: "Wachtwoord succesvol gereset"
      }
    });
  } catch (err) {
    console.error("Reset password error:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

// --- General Registration ---
const verifyOtpAndRegisterGeneral = async (req, res) => {
  try {
    const { userType } = req.body;

    // If userType is provided in body, use it; otherwise default to 'client'
    const targetUserType = userType || "client";

    // Validate userType
    if (!["client", "vendor"].includes(targetUserType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid userType. Must be client or vendor",
      });
    }

    // Currently only client registration is implemented
    if (targetUserType === "vendor") {
      return res.status(400).json({
        success: false,
        message:
        {
          en: "Vendor registration is not yet implemented. Please use client registration.",
          nl: "Leverancier registratie is nog niet geïmplementeerd. Gebruik alstublieft client registratie."
        },
      });
    }

    return verifyOtpAndRegister(req, res, targetUserType);
  } catch (error) {
    console.error("General registration error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// --- Google Authentication ---
const googleAuth = async (req, res) => {
  try {
    const { idToken, type, userData } = req.body;

    if (type != "App" && !idToken) {
      return res.status(400).json({
        success: false,
        message: "ID token is required",
      });
    }

    let userInfo;
    // 🟢 APP LOGIN (Google OAuth Token)
    if (type === "App") {
      let user = await User.findOne({
        email: userData?.email,
        userType: "client",
        isActive: true,
      });

      if (user) {
        if (user.provider === "email") {
          return res.status(403).json({
            success: false,
            message:
              { en: "This email is registered with email/password. Please login using email/password.", nl: "Dit email is geregistreerd met email/wachtwoord. Log alstublieft in met email/wachtwoord." },
          });
        }

        user.lastLogin = new Date();
        await user.save();
        const accessToken = buildAccessToken(user);

        return res.json({
          success: true,
          message: {
            en: "Login successful",
            nl: "Inloggen gelukt"
          },
          tokens: { access: accessToken },
          user: {
            id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            userType: user.userType,
            profileImage: user.profileImage,
          },
        });
      }

      console.log(user, "useruseruseruseruser");

      user = new User({
        firstName: userData?.firstName,
        lastName: userData?.lastName,
        email: userData?.email,
        userType: "client",
        provider: "google",
        profileImage: userData?.picture,
        isActive: true,
        lastLogin: new Date(),
      });

      await user.save();
      const accessToken = buildAccessToken(user);
      return res.status(201).json({
        success: true,
        message: "Registration and login successful",
        tokens: { access: accessToken },
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          profileImage: user.profileImage,
        },
      });
      // try {
      //   const ticket = await googleClient.verifyIdToken({
      //     idToken,
      //     audience: process.env.FIREBASE_WEB_CLIENT_ID
      //   });

      //   const payload = ticket.getPayload();
      //   userInfo = {
      //     uid: payload.sub,
      //     email: payload.email,
      //     name: payload.name,
      //     picture: payload.picture
      //   };
      // } catch (error) {
      //   return res.status(401).json({
      //     success: false,
      //     message: "Invalid Google OAuth token (App)"
      //   });
      // }
    }

    // 🔵 WEB LOGIN (Firebase ID Token)
    else {
      try {
        const decodedToken = await auth.verifyIdToken(idToken);
        userInfo = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          name: decodedToken.name,
          picture: decodedToken.picture,
        };
      } catch (error) {
        return res.status(401).json({
          success: false,
          message: "Invalid Firebase ID token (Web)",
        });
      }
    }

    const { uid, email, name, picture } = userInfo;

    if (!email || !name) {
      return res.status(400).json({
        success: false,
        message: "Email and name are required",
      });
    }

    // ----- YOUR EXISTING DB LOGIC BELOW -----

    let user = await User.findOne({
      email,
      userType: "client",
      isActive: true,
    });

    if (user) {
      if (user.provider === "email") {
        return res.status(403).json({
          success: false,
          message:
            "This email is registered with email/password. Please login using email/password.",
        });
      }

      user.lastLogin = new Date();
      await user.save();
      const accessToken = buildAccessToken(user);

      return res.json({
        success: true,
        message: "Login successful",
        tokens: { access: accessToken },
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          profileImage: user.profileImage,
        },
      });
    }

    const [firstName, ...lastNameParts] = name.split(" ");
    const lastName = lastNameParts.join(" ");

    user = new User({
      firstName,
      lastName,
      email,
      userType: "client",
      googleId: uid,
      provider: "google",
      profileImage: picture,
      isActive: true,
      lastLogin: new Date(),
    });

    await user.save();
    const accessToken = buildAccessToken(user);

    return res.status(201).json({
      success: true,
      message: "Registration and login successful",
      tokens: { access: accessToken },
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType,
        profileImage: user.profileImage,
      },
    });
  } catch (error) {
    console.log(error, "errorerrorerror");

    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// --- Vendor Registration ---
const registerVendor = async (req, res) => {
  try {
    const {
      accountType, // 'personal' or 'business'
      firstName,
      lastName,
      email,
      contactNumber,
      city,
      postalCode,
      fullAddress,
      passportDetails,
      kvkNumber,
      mainCategories,
      subCategories,
      password,
      confirmPassword,
      otp,
      // Business fields
      businessName,
      businessNumber,
      businessLocation,
      businessWebsite,
      businessDescription,
      businessLogo,
      businessImage,
      whyChooseUs,
      teamType,
      teamSize,
    } = req.body;

    // Validate accountType
    if (!["personal", "business"].includes(accountType)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid account type" });
    }

    // Common validations
    if (!email || !contactNumber || !password || !confirmPassword || !otp) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Password and confirm password do not match",
      });
    }

    // Personal account validations
    if (accountType === "personal") {
      if (
        !firstName ||
        !lastName ||
        !city ||
        !postalCode ||
        !fullAddress ||
        !passportDetails ||
        !mainCategories ||
        !subCategories
      ) {
        return res.status(400).json({
          success: false,
          message: "Missing required personal account fields",
        });
      }
    }
    // Business account validations
    if (accountType === "business") {
      if (
        !businessName ||
        !businessNumber ||
        !teamSize ||
        !teamType ||
        !kvkNumber
      ) {
        return res.status(400).json({
          success: false,
          message: "Missing required business account fields",
        });
      }
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(409)
        .json({ success: false, message: "Email already registered" });
    }

    // OTP verification (same as client registration)
    const valid = await verifyOTP(email, otp);
    if (!valid) {
      return res
        .status(400)
        .json({
          success: false, message: {
            en: "Invalid or expired OTP",
            nl: "Ongeldige of verlopen OTP",
          }
        });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userData = {
      firstName: accountType === "personal" ? firstName : businessName,
      email,
      contactNumber,
      address: fullAddress || "",
      password: hashedPassword,
      userType: "vendor",
      accountType, // Add accountType field
      isActive: true,
      ...(accountType === "personal" && { lastName, passportDetails }),
      ...(accountType === "business" && { kvkNumber, passportDetails }),
    };
    const user = new User(userData);
    await user.save();

    // Create vendor profile
    const vendorData = {
      userId: user._id,
      mainCategories: mainCategories || [],
      subCategories: subCategories || [],
      isApproved: false,
      // Business fields
      ...(accountType === "business" && {
        businessName,
        businessPhone: businessNumber,
        businessWebsite,
        businessDescription,
        businessLogo,
        businessImage,
        whyChooseUs,
        teamType,
        teamSize,
      }),
    };
    const vendor = new Vendor(vendorData);
    await vendor.save();

    // Notify admin(s) of new vendor registration
    try {
      const notificationController = require("./notificationController");
      await notificationController.createAdminNotification({
        message: `A new vendor has registered: ${accountType === "personal" ? firstName + " " + lastName : businessName
          }`,
      });
    } catch (e) {
      console.error(
        "Failed to create admin notification for new vendor registration:",
        e,
      );
    }

    res.status(201).json({
      success: true,
      message: "Vendor registration successful.",
    });
  } catch (err) {
    console.error("Vendor registration error:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

// --- Vendor Login ---
const vendorLogin = async (req, res) => {
  try {
    const { email, password, provider } = req.body;
    console.log(req.body, "REQQQQasdasdasd");

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }
    let user = await User.findOne({ email, userType: 'vendor' });
    let isEmployee = false;
    console.log(user, "useruseruseruser");

    if (!user) {
      user = await Employee.findOne({ email }).populate("vendor");
      console.log(user, "USERRRR");

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Account not found",
        });
      }
      isEmployee = true;
    }
    console.log(user.isActive, "user.statususer.status");

    if (!user.isActive) {
      return res.status(400).json({
        success: false,
        message: "Account not active! Please contact support",
      });
    }

    // --- GOOGLE LOGIN ---
    if (provider === "google") {
      if (user.provider && user.provider !== "google") {
        return res.status(403).json({
          success: false,
          message: {
            en: "This email is registered with password. Please login using email/password.",
            nl: "Dit e-mailadres is geregistreerd met een wachtwoord. Log in met e-mail/wachtwoord.",
          }
        });
      }

      const token = signToken({
        id: user.createdById != null ? user.createdById : user._id,
        name: user.name,
      });
      const responseUser = {
        id: user._id,
        firstName: user.firstName,
        email: user.email,
        profileImage: user.profileImage,
        userType: "customer",
        vendorId: isEmployee ? user.vendorId?._id : null,
      };

      return res.json({
        success: true,
        message: {
          en: "Login successful",
          nl: "Inloggen gelukt",
        },
        token,
        user: responseUser,
      });
    }

    // --- EMAIL LOGIN ---
    if (!password) {
      return res.status(400).json({
        success: false,
        message: {
          en: "Password is required for email login",
          nl: "Wachtwoord is vereist voor e-mail login",
        }
      });
    }

    if (user.provider === "google") {
      return res.status(403).json({
        success: false,
        message:
        {
          en: "This account was created with Google. Please login using Google.",
          nl: "Dit account is aangemaakt met Google. Log in met Google.",
        },
      });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: {
          en: "Invalid email or password",
          nl: "Ongeldig e-mailadres of wachtwoord",
        }
      });
    }

    // If it's a regular User, fetch vendor and permissions
    let pages = [];
    let vendorId = null;
    const vendor = await Vendor.findOne({ userId: user._id }).populate(
      "userId",
      "-password"
    );
    vendorId = vendor?._id;
    console.log(user, isEmployee, "useruseruseruser");
    let designation = null;
    if (isEmployee) {
      designation = await VendorDesignations.findOne({
        _id: user.designation,        // employee's designation id
        vendorId: user.vendor._id,    // vendor they belong to
      });
    } else {
      designation = await VendorDesignations.findOne({
        vendorId: user.createdById,
      });
    }
    console.log(designation, "designationdesignationdesignation");
    pages = designation?.permissions?.map((p) => p.module) || [];
    console.log(user, "useruseruseruser");
    const token = signToken({
      id: isEmployee ? user.vendor.id : user._id,
      name: user.name,
    });

    const vendorDetails = await Vendor.findOne({ userId: user._id });

    const responseUser = {
      id: isEmployee ? user.vendor.id : user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      profileImage: user.profileImage,
      userType: isEmployee ? "Employee" : "vendor",
      vendorId,
      vendorDetails
    };

    if (pages.length > 0) {
      responseUser.pages = pages;
    }

    return res.json({
      success: true,
      message: {
        en: "Login successful",
        nl: "Inloggen gelukt",
      },
      token,
      user: responseUser,
    });
  } catch (err) {
    console.error("Vendor Login Error:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const resetPasswordForEmployee = async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email and new password are required",
      });
    }
    const user = await Employee.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    await user.save();
    return res.json({
      success: true,
      message: {
        en: "Password reset successful",
        nl: "Wachtwoord reset gelukt"
      }
    });
  } catch (err) {
    console.error("Error resetting password:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// --- Check already registered user ---
const checkRegisteredUser = async (req, res) => {
  try {
    const { email, contactNumber, userType } = req.body;

    if (!email && !contactNumber) {
      return res.status(400).json({
        success: false,
        message: "Email or contactNumber is required",
      });
    }

    // Validate userType if provided
    if (userType && !["client", "vendor", "admin"].includes(userType)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid userType" });
    }

    const query = {};
    if (email) query.email = email;
    if (contactNumber) query.contactNumber = contactNumber;

    // If userType provided, include in query to narrow search
    if (userType) query.userType = userType;

    const existingUser = await User.findOne(query).lean();

    if (!existingUser) {
      return res.json({
        success: true,
        exists: false,
        message: "No account found. You may proceed to register.",
      });
    }

    // If found, return minimal info (avoid leaking sensitive data)
    // Provide a helpful message depending on provider
    const provider = existingUser.provider || "email";
    const accountHint =
      provider === "google"
        ? "This account uses Google Sign-In. Please use Google to sign in."
        : "An account already exists.";
    return res.json({
      success: true,
      exists: true,
      userType: existingUser.userType || null,
      provider,
      message: accountHint,
    });
  } catch (err) {
    console.error("Check registered user error:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

const registerVendor2 = async (req, res) => {
  try {
    const { toMultilingualText } = require("../utils/textUtils");
    const {
      accountType,
      email,
      businessEmail,
      contactNumber,
      password,
      confirmPassword,
      otp,
      firstName,
      lastName,
      fullAddress,
      passportDetails,
      kvkNumber,
      mainCategories,
      subCategories,
      businessName,
      businessNumber,
      businessWebsite,
      businessDescription,
      businessLogo,
      businessImage,
      whyChooseUs,
      teamType,
      teamSize,
      tagline,
      description,
      postalCode,
      city,
    } = req.body;

    // ✅ Basic Validation
    if (!["personal", "business"].includes(accountType))
      return res
        .status(400)
        .json({ success: false, message: "Invalid account type" });
    console.log(password, confirmPassword, otp, "VA");

    if (password !== confirmPassword)
      return res
        .status(400)
        .json({ success: false, message: "Passwords do not match" });

    // ✅ Account-specific validation
    const requiredPersonal = [
      email,
      firstName,
      lastName,
      fullAddress,
      passportDetails,
      mainCategories,
      subCategories,
    ];
    const requiredBusiness = [
      businessEmail,
      businessName,
      teamType,
      teamSize,
      kvkNumber,
      mainCategories,
      subCategories,
    ];

    // ✅ Choose email
    const registrationEmail =
      accountType === "business" ? businessEmail : email;

    // ✅ Check if user exists
    const existingUser = await User.findOne({ email: registrationEmail });
    if (existingUser)
      return res
        .status(409)
        .json({ success: false, message: "Email already registered" });

    // ✅ Verify OTP
    if (!(await verifyOTP(registrationEmail, otp)))
      return res
        .status(400)
        .json({
          success: false, message: {
            en: "Invalid or expired OTP",
            nl: "Ongeldige of verlopen OTP",
          }
        });

    // ✅ Create User
    const user = await User.create({
      email: registrationEmail,
      contactNumber,
      password: await bcrypt.hash(password, 10),
      userType: "vendor",
      accountType,
      firstName: accountType === "personal" ? firstName : businessName,
      lastName: accountType === "personal" ? lastName : undefined,
      address: fullAddress,
      passportDetails,
      kvkNumber,
      isActive: true,
      tagline: toMultilingualText(tagline),
      description: toMultilingualText(description),
      postalCode,
      city,
    });

    // ✅ Vendor Data
    const vendorData = {
      userId: user._id,
      mainCategories,
      subCategories,
      businessName:
        accountType === "personal" ? `${firstName} ${lastName}` : businessName,
      businessEmail: registrationEmail,
      businessPhone:
        accountType === "personal" ? contactNumber : businessNumber,
      businessWebsite,
      businessDescription: toMultilingualText(businessDescription),
      businessLogo,
      businessImage,
      whyChooseUs: toMultilingualText(whyChooseUs),
      teamType,
      teamSize,
      kvkNumber,
      accountType,
      businessLocation: fullAddress,
      isApproved: false,
      tagline: toMultilingualText(tagline),
      description: toMultilingualText(description),
    };

    await Vendor.create(vendorData);

    const adminsToNotify = await AdminEmployee.findOne({
      role: "Admin",
      status: "active",
      "notificationSettings.push.newRegistration": true
    }).select("_id name email");

    console.log(adminsToNotify, "adminsToNotifyadminsToNotifyadminsToNotify");


    if (adminsToNotify) {
      await notificationController.createNotification({
        title: {
          en: "New Vendor Registration",
          nl: "Nieuwe leveranciersregistratie"
        },
        notificationFor: "Admin",
        vendorId: null, // vendor's user account receives notification
        clientId: user._id, // vendor's user account receives notification
        bookingId: null,
        message: {
          en: `A new vendor has registered: ${businessName}`,
          nl: `Een nieuwe leverancier heeft zich geregistreerd: ${businessName}`,
        },
      });
    }

    res.status(201).json({
      success: true,
      message: {
        en: "Vendor registration successful.",
        nl: "Leverancier registratie geslaagd."
      }
    });
  } catch (err) {
    console.error("Vendor registration error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

const connectVendorStripe = async (req, res) => {
  try {
    console.log(req.user, "req.userreq.userreq.userreq.userreq.user")
    const vendor = await User.findOne({ _id: req.user.id });
    console.log(vendor, "vendorvendorvendorvendor");

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    // Reuse existing account
    if (vendor.stripeAccountId) {
      return res.json({
        success: true,
        stripeAccountId: vendor.stripeAccountId,
      });
    }

    const account = await stripe.accounts.create({
      type: "express",
      email: req.user.email,
      capabilities: {
        transfers: { requested: true },
      },
    });

    vendor.stripeAccountId = account.id;
    await vendor.save();

    res.json({
      success: true,
      stripeAccountId: account.id,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getStripeOnboardingLink = async (req, res) => {
  try {
    const vendor = await User.findOne({ _id: req.user.id });
    console.log(vendor, "vendorvendorvendorvendor");
    if (!vendor?.stripeAccountId) {
      return res.status(400).json({
        success: false,
        message: "Connect Stripe first",
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: vendor.stripeAccountId,
      refresh_url: "http://localhost:5173/leverancier/profielbeheer/succes",
      return_url: "http://localhost:5173/leverancier/succes",
      type: "account_onboarding",
    });

    res.json({
      success: true,
      url: accountLink.url,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const checkStripeOnboardingStatus = async (req, res) => {
  try {
    const vendor = await User.findOne({ _id: req.user.id });

    const account = await stripe.accounts.retrieve(
      vendor.stripeAccountId
    );

    const onboarded =
      account.details_submitted &&
      account.charges_enabled &&
      account.payouts_enabled;

    vendor.stripeOnboardingComplete = onboarded;
    await vendor.save();

    res.json({
      success: true,
      onboarded,
      account,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// --- Exports ---
module.exports = {
  // Authentication
  clientLogin,
  vendorLogin,
  adminLogin,

  logout,
  getCurrentUser,
  googleAuth,

  // Registration
  registerClient,
  verifyOtpAndRegister: verifyOtpAndRegisterGeneral,
  registerVendor2,

  // OTP Management
  sendOtpForRegister,
  sendOtpForForgotPassword,
  verifyOtpForForgotPassword,

  // Password Management
  resetPassword,
  checkRegisteredUser,
  resetPasswordForEmployee,
  connectVendorStripe,
  getStripeOnboardingLink,
  checkStripeOnboardingStatus
};
