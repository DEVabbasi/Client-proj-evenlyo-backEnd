const asyncHandler = require('express-async-handler');
const Settings = require('../../models/Settings');
const { ensureAppSettings } = require('../../utils/ensureAppSettings');

const getSetings = asyncHandler(async (req, res) => {
  await ensureAppSettings();
  const settings = await Settings.findOne().lean();

  res.json({
    success: true,
    data: {
      androidVersion: settings.androidVersion,
      isAndroidPopUpShow: settings.isAndroidPopUpShow,
      iosVersion: settings.iosVersion,
      isIosPopUpShow: settings.isIosPopUpShow,
    },
  });
});

module.exports = {
  getSetings,
};
