const express = require("express");
const {identifyContact} = require('../service/contactService')
const router = express.Router();
router.post("/identify", identifyContact);

module.exports = router;
