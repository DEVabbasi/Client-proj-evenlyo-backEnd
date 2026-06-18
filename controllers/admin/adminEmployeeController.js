const AdminEmployee = require('../../models/AdminEmployee');
const bcrypt = require('bcryptjs');
const { signToken, successHelper, signPasswordResetToken, verifyPasswordResetToken } = require('../../utils/jwtUtils');
const AdminDesignation = require("../../models/AdminDesignation");
const { generateAndSendOTP, verifyOTP } = require('../../utils/otpUtils');
// Create employee
exports.createAdmin = async (req, res) => {
  try {
    const { password, ...rest } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const employee = new AdminEmployee({ ...rest, password: hashedPassword });
    await employee.save();
    res.status(201).json(employee);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.sendForgotPasswordforAdmin = async (req, res) => {
  try {
    let { email } = req.body;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Normalize email to avoid case-sensitivity issues
    email = String(email).trim().toLowerCase();

    // Check if user exists and is active
    const user = await AdminEmployee.findOne({ email });
    if (!user) {
      // Do NOT send OTP when user does not exist for forgot-password flow
      return res.status(404).json({
        success: false,
        message: "No account found with this email",
      });
    }
    await generateAndSendOTP(email);

    res.json({
      success: true,
      message: "OTP sent to email",
    });
  } catch (err) {
    console.error("Send OTP (forgot) error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
};

exports.verifyOtpForAdmin = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    // Check if user exists and is not a social login user
    const user = await AdminEmployee.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email",
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
      message: "OTP verified. You may now reset your password.",
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

exports.resetPasswordForAdmin = async (req, res) => {
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
    const user = await AdminEmployee.findOne({ email });
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({
      success: true, message: {
        en: "Password reset successful",
        nl: "Wachtwoord reset gelukt"
      }
    });
  } catch (err) {
    console.error("Reset password error:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};


exports.loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    const admin = await AdminEmployee.findOne({ email, status: "active" });
    console.log(admin, "adminadminadminadminadmin");

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    const token = signToken({
      id: admin._id,
      name: admin.name,
    });

    return res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

exports.createEmployee = async (req, res) => {
  try {
    const { password, ...rest } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const employee = new AdminEmployee({
      ...rest,
      password: hashedPassword,
    });
    await employee.save();
    res.status(201).json(employee);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.loginEmployee = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: {
          en: "Email and password are required",
          nl: "E-mail en wachtwoord zijn verplicht",
        },
      });
    }

    const employee = await AdminEmployee.findOne({ email });
    if (!employee) {
      return res.status(401).json({
        success: false,
        message: {
          en: "Invalid email or password",
          nl: "Ongeldig e-mailadres of wachtwoord",
        },
      });
    }

    const isMatch = await bcrypt.compare(password, employee.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: {
          en: "Invalid email or password",
          nl: "Ongeldig e-mailadres of wachtwoord",
        },
      });
    }

    if (employee.status == "inactive") {
      return res.status(401).json({
        success: false,
        message: {
          en: "Your account is inactive. Please contact an administrator.",
          nl: "Je account is inactief. Neem contact op met een beheerder.",
        },
      });
    }

    // Only fetch pages if Employee role
    let pages = [];
    if (employee.role === "Employee" && employee.designationID) {
      const designation = await AdminDesignation.findById(employee.designationID);
      pages = designation?.permissions?.map(p => p.module) || [];
    }

    const token = signToken({
      id: employee._id,
      name: employee.name,
    });

    employee.lastLogin = new Date();
    await employee.save();

    const responseData = {
      id: employee._id,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      status: employee.status,
    };

    if (employee.role === "Employee") {
      responseData.pages = pages;
    }

    return res.status(200).json({
      success: true,
      message: {
        en: "Login successful",
        nl: "Inloggen gelukt",
      },
      token,
      user: responseData
    });

  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({
      success: false,
      message: {
        en: "Internal server error",
        nl: "Interne serverfout",
      },
    });
  }
};


// Get all employees
exports.getEmployees = async (req, res) => {
  try {
    const employees = await AdminEmployee.find({ role: "Employee" }).populate("designationID");
    successHelper(res, employees, "employess fetch successfully");
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get single employee
exports.getEmployee = async (req, res) => {
  try {
    const employee = await AdminEmployee.findById(req.params.id).populate('designation');
    if (!employee) return res.status(404).json({ error: 'Not found' });
    res.json(employee);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update employee
exports.updateEmployee = async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }
    const employee = await AdminEmployee.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!employee) return res.status(404).json({ error: 'Not found' });
    res.json(employee);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Delete employee
exports.deleteEmployee = async (req, res) => {
  try {
    const employee = await AdminEmployee.findByIdAndDelete(req.params.id);
    if (!employee) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Employee Deleted Successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Toggle employee status (active/inactive)
exports.toggleEmployeeStatus = async (req, res) => {
  try {
    const employee = await AdminEmployee.findById(req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    employee.status = employee.status === 'active' ? 'inactive' : 'active';
    await employee.save();
    res.json({ message: `Employee status updated to ${employee.status}`, employee });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
