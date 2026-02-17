const { translateDutchToEnglish } = require("../../controllers/vendor/langaugeController");
const express = require('express');
const router = express.Router();


router.post("/translate", translateDutchToEnglish);


module.exports = router;