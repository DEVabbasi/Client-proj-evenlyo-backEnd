const express = require('express');
const router = express.Router();
const { getSetings } = require('../../controllers/client/appSettingsController');

router.get('/getSetings', getSetings);

module.exports = router;
