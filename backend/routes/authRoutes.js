const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const verifyToken = require('../middleware/auth');

router.post('/login', authController.login);
router.get('/verify', verifyToken, authController.verifySession);

module.exports = router;
