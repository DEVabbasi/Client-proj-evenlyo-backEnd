const AdminDesignation = require('../../models/AdminDesignation');
const AdminEmployee = require('../../models/AdminEmployee');

// Create designation
exports.createDesignation = async (req, res) => {
  try {
    const designation = new AdminDesignation(req.body);
    await designation.save();
    res.status(201).json(designation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get all designations
exports.getDesignations = async (req, res) => {
  try {
    const designations = await AdminDesignation.find().sort({ createdAt: -1 });
    res.json(designations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get single designation
exports.getDesignation = async (req, res) => {
  try {
    const designation = await AdminDesignation.findById(req.params.id);
    if (!designation) return res.status(404).json({ error: 'Not found' });
    res.json(designation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update designation
exports.updateDesignation = async (req, res) => {
  try {
    const designation = await AdminDesignation.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!designation) return res.status(404).json({ error: 'Not found' });
    res.json(designation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Delete designation
exports.deleteDesignation = async (req, res) => {
  try {
    const designationId = req.params.id;
    const isAssigned = await AdminEmployee.findOne({ designationID: designationId });
    if (isAssigned) {
      return res.status(400).json({
        message: "Cannot delete this designation. It is assigned to one or more employees.",
      });
    }
    const designation = await AdminDesignation.findByIdAndDelete(req.params.id);
    if (!designation) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Designation Deleted Successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
