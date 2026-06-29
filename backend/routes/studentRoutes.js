const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const studentController = require('../controllers/studentController');
const verifyToken = require('../middleware/auth');

// Public routes
router.post('/register', studentController.registerStudent);
router.get('/speedtest-payload', studentController.getSpeedtestPayload);
router.get('/speedtest-config', studentController.getSpeedtestConfig);
router.get('/contact-config', studentController.getContactConfig);
router.get('/detect-ip', studentController.detectIP);

const multer = require('multer');
const uploadTempDir = path.join(__dirname, '../uploads/temp');
fs.mkdirSync(uploadTempDir, { recursive: true });

const upload = multer({
  dest: uploadTempDir
});
router.post('/upload', upload.single('file'), studentController.uploadFile);

// Admin-only routes (protected by JWT verification token)
router.get('/', verifyToken, studentController.getAllStudents);
router.get('/stats', verifyToken, studentController.getStats);
router.get('/export-mac', verifyToken, studentController.exportAcceptedMac);
router.get('/export-csv', verifyToken, studentController.exportCSV);
router.put('/speedtest-config', verifyToken, studentController.updateSpeedtestConfig);
router.put('/contact-config', verifyToken, studentController.updateContactConfig);
router.get('/email-config', verifyToken, studentController.getEmailConfig);
router.put('/email-config', verifyToken, studentController.updateEmailConfig);
router.get('/other-macs', verifyToken, studentController.getOtherMacs);
router.put('/other-macs', verifyToken, studentController.updateOtherMacs);
router.post('/broadcast', verifyToken, studentController.sendMailBroadcast);
router.put('/:id/status', verifyToken, studentController.updateStatus);
router.put('/:id/payment', verifyToken, studentController.updatePaymentStatus);
router.post('/:id/message', verifyToken, studentController.sendSingleMail);
router.put('/:id', verifyToken, studentController.editStudent);
router.delete('/:id', verifyToken, studentController.deleteStudent);

module.exports = router;
