const Settings = require('../models/Settings');

const APP_SETTINGS_DEFAULTS = {
  androidVersion: 1,
  isAndroidPopUpShow: false,
  iosVersion: 1,
  isIosPopUpShow: false,
};

async function ensureAppSettings() {
  const settings = await Settings.findOne().lean();

  if (!settings) {
    await Settings.create({
      bookingItemPlatformFee: 0,
      salesItemPlatformFee: 0,
      vat: 0,
      ...APP_SETTINGS_DEFAULTS,
    });
    return;
  }

  const updates = {};
  for (const [key, value] of Object.entries(APP_SETTINGS_DEFAULTS)) {
    if (!Object.prototype.hasOwnProperty.call(settings, key)) {
      updates[key] = value;
    }
  }

  if (Object.keys(updates).length > 0) {
    await Settings.updateOne({ _id: settings._id }, { $set: updates });
  }
}

module.exports = { ensureAppSettings, APP_SETTINGS_DEFAULTS };
