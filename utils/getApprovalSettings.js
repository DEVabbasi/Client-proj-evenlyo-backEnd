const Settings = require("../models/Settings");

const DEFAULT_APPROVAL_SETTINGS = {
  itemApprovalRequired: true,
  editReapprovalRequired: true,
  rejectionFlowEnabled: true,
  vendorActivationRequired: true,
};

const getApprovalSettings = async () => {
  const settings = await Settings.findOne().select("approvalSettings").lean();

  if (!settings?.approvalSettings) {
    return DEFAULT_APPROVAL_SETTINGS;
  }

  return {
    vendorActivationRequired:
      settings?.approvalSettings?.vendorActivationRequired ?? true,

    itemApprovalRequired:
      settings?.approvalSettings?.itemApprovalRequired ?? true,
  };
};

module.exports = {
  getApprovalSettings,
  DEFAULT_APPROVAL_SETTINGS,
};
