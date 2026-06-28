const { Student, Setting } = require('../database/db');
const https = require('https');
const http = require('http');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configure Cloudinary if environment variables are set and populated (trimmed and placeholder validation)
const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();

const isPlaceholder = (val) => {
  const v = val.toLowerCase();
  return (
    v === 'none' ||
    v.includes('your_') ||
    v.includes('placeholder') ||
    v.includes('change_me') ||
    /^[xX]+$/.test(v)
  );
};

const isCloudinaryConfigured = !!(
  cloudName && !isPlaceholder(cloudName) &&
  apiKey && !isPlaceholder(apiKey) &&
  apiSecret && !isPlaceholder(apiSecret)
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret
  });
}

// Helper to fetch JSON from third-party URL
const fetchJSON = (url) => {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
};

// Helper to validate email
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Helper to validate Indian/General 10-digit mobile number
const validateMobile = (mobile) => {
  const mobileRegex = /^\d{10}$/;
  return mobileRegex.test(mobile);
};

// Helper to validate and normalize MAC Address
const validateAndNormalizeMAC = (mac) => {
  const cleaned = mac.replace(/[:.-]/g, '').toUpperCase().trim();
  const hexRegex = /^[0-9A-F]{12}$/;
  if (!hexRegex.test(cleaned)) {
    return null;
  }
  const formatted = cleaned.match(/.{1,2}/g).join(':');
  return formatted;
};

// Simple HTML escaping helper for XSS prevention
const sanitizeInput = (str) => {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

// Simple URL sanitization helper (keeps slashes intact)
const sanitizeUrl = (str) => {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[<>'"\s]/g, '');
};

// Helper to map Mongoose doc to plain JS object with 'id' property (unescapes urls if needed)
const mapStudentDoc = (doc) => {
  let screenshot = doc.screenshot_url || '';
  if (typeof screenshot === 'string') {
    screenshot = screenshot.replace(/&#x2F;/g, '/');
  }
  return {
    id: doc._id.toString(),
    name: doc.name,
    mobile: doc.mobile,
    email: doc.email,
    room_number: doc.room_number,
    room_type: doc.room_type,
    mac_address: doc.mac_address,
    mac_address_2: doc.mac_address_2 || '',
    mac_address_3: doc.mac_address_3 || '',
    mac_address_4: doc.mac_address_4 || '',
    payment_status: doc.payment_status || 'Unpaid',
    screenshot_url: screenshot,
    status: doc.status,
    created_at: doc.created_at
  };
};

// Helper to sort students: Room Type (A then B) and Room Number (Ascending)
const sortStudentsArray = (arr) => {
  return arr.sort((a, b) => {
    // 1. Sort by room_type (A < B)
    if (a.room_type !== b.room_type) {
      return a.room_type.localeCompare(b.room_type);
    }
    // 2. Sort by room_number ascending
    const roomA = parseInt(a.room_number, 10);
    const roomB = parseInt(b.room_number, 10);
    if (!isNaN(roomA) && !isNaN(roomB)) {
      if (roomA !== roomB) return roomA - roomB;
    }
    return a.room_number.localeCompare(b.room_number);
  });
};

// 1. Register a connection
exports.registerStudent = async (req, res) => {
  const { name, mobile, email, room_number, room_type, mac_address, screenshot_url } = req.body;

  if (!name || !mobile || !email || !room_number || !room_type || !mac_address || !screenshot_url) {
    return res.status(400).json({ message: 'All fields, including payment screenshot, are required.' });
  }

  // Sanitize
  const cleanName = sanitizeInput(name);
  const cleanMobile = sanitizeInput(mobile);
  const cleanEmail = sanitizeInput(email);
  const cleanRoomNumber = sanitizeInput(room_number);
  const cleanRoomType = sanitizeInput(room_type).toUpperCase();
  const cleanMac = sanitizeInput(mac_address);

  // Validations
  if (cleanName.length < 2) {
    return res.status(400).json({ message: 'Name must be at least 2 characters.' });
  }

  if (!validateMobile(cleanMobile)) {
    return res.status(400).json({ message: 'Mobile number must be a valid 10-digit number.' });
  }

  if (!validateEmail(cleanEmail)) {
    return res.status(400).json({ message: 'Invalid email address format.' });
  }

  if (cleanRoomType !== 'A' && cleanRoomType !== 'B') {
    return res.status(400).json({ message: 'Room type must be A or B.' });
  }

  const normalizedMac = validateAndNormalizeMAC(cleanMac);
  if (!normalizedMac) {
    return res.status(400).json({ message: 'Invalid MAC address format. Example: AA:BB:CC:DD:EE:FF' });
  }

  try {
    // Check for duplicate active registrations (MAC, Email, or Mobile)
    const duplicate = await Student.findOne({
      status: { $in: ['Pending', 'Accepted'] },
      $or: [
        { mac_address: normalizedMac },
        { mac_address_2: normalizedMac },
        { mac_address_3: normalizedMac },
        { mac_address_4: normalizedMac },
        { email: cleanEmail },
        { mobile: cleanMobile }
      ]
    });

    if (duplicate) {
      let field = '';
      if (duplicate.mac_address === normalizedMac ||
          duplicate.mac_address_2 === normalizedMac ||
          duplicate.mac_address_3 === normalizedMac ||
          duplicate.mac_address_4 === normalizedMac) {
        field = 'MAC address';
      }
      else if (duplicate.email === cleanEmail) field = 'Email address';
      else if (duplicate.mobile === cleanMobile) field = 'Mobile number';

      return res.status(400).json({ 
        message: `A student with this ${field} is already registered and is currently ${duplicate.status}.` 
      });
    }

    const student = new Student({
      name: cleanName,
      mobile: cleanMobile,
      email: cleanEmail,
      room_number: cleanRoomNumber,
      room_type: cleanRoomType,
      mac_address: normalizedMac,
      screenshot_url: sanitizeUrl(screenshot_url),
      status: 'Pending'
    });

    await student.save();

    // Check if pending approvals exceed 8
    try {
      const pendingCount = await Student.countDocuments({ status: 'Pending' });
      if (pendingCount > 8) {
        // Fetch admin email from settings
        const contactSetting = await Setting.findOne({ key: 'contact_info' });
        const adminEmail = contactSetting && contactSetting.value && contactSetting.value.email 
          ? contactSetting.value.email 
          : 'support@primenet.local';

        // Trigger alert asynchronously (non-blocking)
        const emailService = require('../utils/emailService');
        emailService.sendAdminAlertEmail(pendingCount, adminEmail).catch(e => {
          console.error('[Email Alert Error]', e.message);
        });
      }
    } catch (countErr) {
      console.error('[Pending Count Check Error]', countErr.message);
    }

    // Trigger registration email asynchronously (non-blocking)
    const emailService = require('../utils/emailService');
    emailService.sendStudentRegistrationEmail(student).catch(e => {
      console.error('[Registration Email Error]', e.message);
    });

    return res.status(201).json({
      message: 'Registration submitted successfully. Waiting for admin approval. A confirmation email has been sent to your inbox.',
      studentId: student._id
    });
  } catch (err) {
    console.error('Error inserting student registration:', err.message);
    return res.status(500).json({ message: 'Failed to submit registration. Please try again.' });
  }
};

// 2. Get all students (Admin only)
exports.getAllStudents = async (req, res) => {
  try {
    const students = await Student.find({});
    const mapped = students.map(mapStudentDoc);
    const sorted = sortStudentsArray(mapped);
    return res.status(200).json(sorted);
  } catch (err) {
    console.error('Error fetching students:', err.message);
    return res.status(500).json({ message: 'Failed to retrieve students.' });
  }
};

// 3. Update Status (Admin only)
exports.updateStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !['Pending', 'Accepted', 'Rejected'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status. Must be Pending, Accepted, or Rejected.' });
  }

  try {
    // 1. Fetch current student record
    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ message: 'Student registration not found.' });
    }

    const wasAccepted = student.status === 'Accepted';

    // 2. Perform update
    student.status = status;
    await student.save();

    // 3. If transitioning to Accepted, trigger confirmation email
    if (!wasAccepted && status === 'Accepted') {
      const emailService = require('../utils/emailService');
      emailService.sendStudentApprovalEmail(student).catch(e => {
        console.error('[Approval Email Error]', e.message);
      });
    }

    return res.status(200).json({ message: `Student status updated to ${status} successfully.` });
  } catch (err) {
    console.error('Error updating status:', err.message);
    return res.status(500).json({ message: 'Failed to update student status.' });
  }
};

// 3b. Update Payment Status (Admin only)
exports.updatePaymentStatus = async (req, res) => {
  const { id } = req.params;
  const { payment_status } = req.body;

  if (!payment_status || !['Paid', 'Unpaid'].includes(payment_status)) {
    return res.status(400).json({ message: 'Invalid payment status. Must be Paid or Unpaid.' });
  }

  try {
    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ message: 'Student registration not found.' });
    }

    student.payment_status = payment_status;
    await student.save();

    return res.status(200).json({ message: `Student payment status updated to ${payment_status} successfully.` });
  } catch (err) {
    console.error('Error updating payment status:', err.message);
    return res.status(500).json({ message: 'Failed to update student payment status.' });
  }
};

// 4. Edit Student Registration (Admin only)
exports.editStudent = async (req, res) => {
  const { id } = req.params;
  const { name, mobile, email, room_number, room_type, mac_address, mac_address_2, mac_address_3, mac_address_4, payment_status, status, screenshot_url } = req.body;

  if (!name || !mobile || !email || !room_number || !room_type || !mac_address || !status) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  // Sanitize
  const cleanName = sanitizeInput(name);
  const cleanMobile = sanitizeInput(mobile);
  const cleanEmail = sanitizeInput(email);
  const cleanRoomNumber = sanitizeInput(room_number);
  const cleanRoomType = sanitizeInput(room_type).toUpperCase();
  const cleanMac = sanitizeInput(mac_address);
  const cleanMac2 = mac_address_2 ? sanitizeInput(mac_address_2) : '';
  const cleanMac3 = mac_address_3 ? sanitizeInput(mac_address_3) : '';
  const cleanMac4 = mac_address_4 ? sanitizeInput(mac_address_4) : '';
  const cleanPaymentStatus = payment_status ? sanitizeInput(payment_status) : 'Unpaid';
  const cleanStatus = sanitizeInput(status);

  // Validate
  if (cleanName.length < 2) {
    return res.status(400).json({ message: 'Name must be at least 2 characters.' });
  }

  if (!validateMobile(cleanMobile)) {
    return res.status(400).json({ message: 'Mobile number must be a valid 10-digit number.' });
  }

  if (!validateEmail(cleanEmail)) {
    return res.status(400).json({ message: 'Invalid email address format.' });
  }

  if (cleanRoomType !== 'A' && cleanRoomType !== 'B') {
    return res.status(400).json({ message: 'Room type must be A or B.' });
  }

  const normalizedMac = validateAndNormalizeMAC(cleanMac);
  if (!normalizedMac) {
    return res.status(400).json({ message: 'Invalid MAC address format.' });
  }

  let normalizedMac2 = '';
  if (cleanMac2) {
    normalizedMac2 = validateAndNormalizeMAC(cleanMac2);
    if (!normalizedMac2) {
      return res.status(400).json({ message: 'Invalid MAC address 2 format.' });
    }
  }

  let normalizedMac3 = '';
  if (cleanMac3) {
    normalizedMac3 = validateAndNormalizeMAC(cleanMac3);
    if (!normalizedMac3) {
      return res.status(400).json({ message: 'Invalid MAC address 3 format.' });
    }
  }

  let normalizedMac4 = '';
  if (cleanMac4) {
    normalizedMac4 = validateAndNormalizeMAC(cleanMac4);
    if (!normalizedMac4) {
      return res.status(400).json({ message: 'Invalid MAC address 4 format.' });
    }
  }

  if (!['Paid', 'Unpaid'].includes(cleanPaymentStatus)) {
    return res.status(400).json({ message: 'Invalid payment status. Must be Paid or Unpaid.' });
  }

  if (!['Pending', 'Accepted', 'Rejected'].includes(cleanStatus)) {
    return res.status(400).json({ message: 'Invalid status. Must be Pending, Accepted, or Rejected.' });
  }

  try {
    // Check duplicate MAC, Email, or Mobile for other active registrations
    const activeMacs = [normalizedMac];
    if (normalizedMac2) activeMacs.push(normalizedMac2);
    if (normalizedMac3) activeMacs.push(normalizedMac3);
    if (normalizedMac4) activeMacs.push(normalizedMac4);

    const duplicate = await Student.findOne({
      status: { $in: ['Pending', 'Accepted'] },
      _id: { $ne: id },
      $or: [
        { mac_address: { $in: activeMacs } },
        { mac_address_2: { $in: activeMacs } },
        { mac_address_3: { $in: activeMacs } },
        { mac_address_4: { $in: activeMacs } },
        { email: cleanEmail },
        { mobile: cleanMobile }
      ]
    });

    if (duplicate) {
      let field = '';
      if (activeMacs.includes(duplicate.mac_address) ||
          (duplicate.mac_address_2 && activeMacs.includes(duplicate.mac_address_2)) ||
          (duplicate.mac_address_3 && activeMacs.includes(duplicate.mac_address_3)) ||
          (duplicate.mac_address_4 && activeMacs.includes(duplicate.mac_address_4))) {
        field = 'MAC address';
      }
      else if (duplicate.email === cleanEmail) field = 'Email address';
      else if (duplicate.mobile === cleanMobile) field = 'Mobile number';

      return res.status(400).json({ 
        message: `This ${field} is already registered to another active user.` 
      });
    }

    // 1. Fetch current student record
    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ message: 'Student registration not found.' });
    }

    const wasAccepted = student.status === 'Accepted';

    // 2. Update fields
    student.name = cleanName;
    student.mobile = cleanMobile;
    student.email = cleanEmail;
    student.room_number = cleanRoomNumber;
    student.room_type = cleanRoomType;
    student.mac_address = normalizedMac;
    student.mac_address_2 = normalizedMac2;
    student.mac_address_3 = normalizedMac3;
    student.mac_address_4 = normalizedMac4;
    student.payment_status = cleanPaymentStatus;
    student.status = cleanStatus;

    if (screenshot_url !== undefined) {
      student.screenshot_url = sanitizeUrl(screenshot_url);
    }

    await student.save();

    // 3. If transitioning to Accepted, trigger confirmation email
    if (!wasAccepted && cleanStatus === 'Accepted') {
      const emailService = require('../utils/emailService');
      emailService.sendStudentApprovalEmail(student).catch(e => {
        console.error('[Approval Email Error]', e.message);
      });
    }

    return res.status(200).json({ message: 'Student registration updated successfully.' });
  } catch (err) {
    console.error('Error updating student registration:', err.message);
    return res.status(500).json({ message: 'Failed to update student registration.' });
  }
};

// Helper to extract Cloudinary details from URL
const extractCloudinaryDetails = (url) => {
  if (!url || typeof url !== 'string') return null;
  if (!url.includes('cloudinary.com')) return null;

  try {
    const parts = url.split('/upload/');
    if (parts.length < 2) return null;

    // Extract resource type (e.g. image, raw, video)
    const leftSide = parts[0].split('/');
    const resourceType = leftSide[leftSide.length - 1] || 'image';

    // Extract public ID
    let pathPart = parts[1];
    pathPart = pathPart.replace(/^v\d+\//, '');

    const lastDotIdx = pathPart.lastIndexOf('.');
    if (lastDotIdx !== -1) {
      pathPart = pathPart.substring(0, lastDotIdx);
    }

    return {
      publicId: decodeURIComponent(pathPart),
      resourceType: resourceType
    };
  } catch (e) {
    console.error('Error extracting Cloudinary details:', e);
  }
  return null;
};

// Helper to destroy Cloudinary asset
const deleteFromCloudinary = (publicId, resourceType) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, { resource_type: resourceType }, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
};

// 5. Delete Student (Admin only)
exports.deleteStudent = async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Find the student first to retrieve their screenshot URL
    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ message: 'Student registration not found.' });
    }

    // 2. If Cloudinary is configured and student has a screenshot, delete it
    if (isCloudinaryConfigured && student.screenshot_url) {
      const details = extractCloudinaryDetails(student.screenshot_url);
      if (details) {
        try {
          const deleteResult = await deleteFromCloudinary(details.publicId, details.resourceType);
          console.log(`Successfully deleted Cloudinary asset (${details.publicId}):`, deleteResult);
        } catch (cloudinaryErr) {
          console.error(`Failed to delete Cloudinary asset (${details.publicId}):`, cloudinaryErr.message);
          // We continue deleting the database record even if Cloudinary deletion fails
        }
      }
    }

    // 3. Delete the student document from DB
    await Student.findByIdAndDelete(id);
    return res.status(200).json({ message: 'Student registration deleted successfully.' });
  } catch (err) {
    console.error('Error deleting student:', err.message);
    return res.status(500).json({ message: 'Failed to delete student registration.' });
  }
};

// 6. Get stats (Admin only)
exports.getStats = async (req, res) => {
  try {
    const [total, pending, accepted, rejected, roomTypeA, roomTypeB, recent] = await Promise.all([
      Student.countDocuments({}),
      Student.countDocuments({ status: 'Pending' }),
      Student.countDocuments({ status: 'Accepted' }),
      Student.countDocuments({ status: 'Rejected' }),
      Student.countDocuments({ room_type: 'A' }),
      Student.countDocuments({ room_type: 'B' }),
      Student.find({}).sort({ _id: -1 }).limit(5)
    ]);

    const mappedRecent = recent.map(mapStudentDoc);

    return res.status(200).json({
      total,
      pending,
      accepted,
      rejected,
      roomTypeA,
      roomTypeB,
      recentRegistrations: mappedRecent
    });
  } catch (err) {
    console.error('Error fetching statistics:', err.message);
    return res.status(500).json({ message: 'Failed to retrieve statistics.' });
  }
};

// 7. Export accepted MAC list as TXT
exports.exportAcceptedMac = async (req, res) => {
  try {
    const students = await Student.find({ status: 'Accepted' }, 'mac_address mac_address_2 mac_address_3 mac_address_4');
    const macs = [];
    students.forEach(s => {
      if (s.mac_address) macs.push(s.mac_address);
      if (s.mac_address_2) macs.push(s.mac_address_2);
      if (s.mac_address_3) macs.push(s.mac_address_3);
      if (s.mac_address_4) macs.push(s.mac_address_4);
    });
    const macList = macs.join('\r\n');
    
    res.setHeader('Content-Disposition', 'attachment; filename="accepted_mac_addresses.txt"');
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(macList);
  } catch (err) {
    console.error('Error exporting MAC addresses:', err.message);
    return res.status(500).json({ message: 'Failed to retrieve MAC list.' });
  }
};

// Extra: Export all registrations as CSV
exports.exportCSV = async (req, res) => {
  try {
    const students = await Student.find({});
    const mapped = students.map(mapStudentDoc);
    const sorted = sortStudentsArray(mapped);

    const headers = 'Name,Mobile Number,Email,Room Number,Room Type,MAC Address,MAC Address 2,MAC Address 3,MAC Address 4,Payment Status,Status,Registration Date';
    const csvRows = sorted.map(r => {
      const escapeCsv = (val) => {
        if (val === null || val === undefined) return '';
        const stringVal = String(val);
        if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
          return `"${stringVal.replace(/"/g, '""')}"`;
        }
        return stringVal;
      };
      return [
        escapeCsv(r.name),
        escapeCsv(r.mobile),
        escapeCsv(r.email),
        escapeCsv(r.room_number),
        escapeCsv(r.room_type),
        escapeCsv(r.mac_address),
        escapeCsv(r.mac_address_2),
        escapeCsv(r.mac_address_3),
        escapeCsv(r.mac_address_4),
        escapeCsv(r.payment_status),
        escapeCsv(r.status),
        escapeCsv(r.created_at)
      ].join(',');
    });

    const csvContent = [headers, ...csvRows].join('\r\n');

    res.setHeader('Content-Disposition', 'attachment; filename="primenet_users_list.csv"');
    res.setHeader('Content-Type', 'text/csv');
    return res.status(200).send(csvContent);
  } catch (err) {
    console.error('Error generating CSV:', err.message);
    return res.status(500).json({ message: 'Failed to generate CSV.' });
  }
};

// 8. Local LAN Speed Test Payload (5MB of zero bytes, public endpoint)
exports.getSpeedtestPayload = (req, res) => {
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  
  const bufferSize = 5 * 1024 * 1024; // 5 MB
  const buffer = Buffer.alloc(bufferSize);
  
  return res.status(200).send(buffer);
};

// 9. Get Speed Test Configuration (Public)
exports.getSpeedtestConfig = async (req, res) => {
  try {
    const setting = await Setting.findOne({ key: 'speed_test_enabled' });
    const enabled = setting ? setting.value === true : true;
    return res.status(200).json({ enabled });
  } catch (err) {
    console.error('Error fetching speedtest config:', err.message);
    return res.status(500).json({ message: 'Failed to retrieve configuration.' });
  }
};

// 10. Update Speed Test Configuration (Admin only)
exports.updateSpeedtestConfig = async (req, res) => {
  const { enabled } = req.body;

  if (enabled === undefined || typeof enabled !== 'boolean') {
    return res.status(400).json({ message: 'Invalid payload. enabled must be a boolean.' });
  }

  try {
    const updated = await Setting.findOneAndUpdate(
      { key: 'speed_test_enabled' },
      { value: enabled },
      { new: true, upsert: true }
    );
    return res.status(200).json({ message: `Speed test ${enabled ? 'enabled' : 'disabled'} successfully.`, enabled: updated.value });
  } catch (err) {
    console.error('Error updating speedtest config:', err.message);
    return res.status(500).json({ message: 'Failed to update configuration.' });
  }
};

// 11. Get Contact Configuration (Public)
exports.getContactConfig = async (req, res) => {
  try {
    const setting = await Setting.findOne({ key: 'contact_info' });
    const defaultContact = {
      phone: '+91 98765 43210',
      email: 'support@primenet.local',
      address_line1: 'Hostel Block-C, Server Room 10',
      address_line2: 'Campus Ground, Pin 751024',
      instagram: 'https://instagram.com/primenet',
      facebook: 'https://facebook.com/primenet',
      youtube: 'https://youtube.com/primenet',
      qr_code_url: '/favicon.png'
    };
    let contact = setting ? JSON.parse(JSON.stringify(setting.value)) : defaultContact;
    if (contact) {
      // Decode escaped HTML slashes
      if (typeof contact.qr_code_url === 'string') {
        contact.qr_code_url = contact.qr_code_url.replace(/&#x2F;/g, '/');
      }
      if (typeof contact.instagram === 'string') contact.instagram = contact.instagram.replace(/&#x2F;/g, '/');
      if (typeof contact.facebook === 'string') contact.facebook = contact.facebook.replace(/&#x2F;/g, '/');
      if (typeof contact.youtube === 'string') contact.youtube = contact.youtube.replace(/&#x2F;/g, '/');

      if (!contact.instagram) contact.instagram = 'https://instagram.com/primenet';
      if (!contact.facebook) contact.facebook = 'https://facebook.com/primenet';
      if (!contact.youtube) contact.youtube = 'https://youtube.com/primenet';
      if (!contact.qr_code_url) contact.qr_code_url = '/favicon.png';
    }
    return res.status(200).json(contact);
  } catch (err) {
    console.error('Error fetching contact config:', err.message);
    return res.status(500).json({ message: 'Failed to retrieve contact configuration.' });
  }
};

// 12. Update Contact Configuration (Admin only)
exports.updateContactConfig = async (req, res) => {
  const { phone, email, address_line1, address_line2, instagram, facebook, youtube, qr_code_url } = req.body;

  if (!phone || !email || !address_line1 || !address_line2) {
    return res.status(400).json({ message: 'All contact fields (phone, email, address_line1, address_line2) are required.' });
  }

  // Basic sanitization
  const cleanPhone = sanitizeInput(phone);
  const cleanEmail = sanitizeInput(email);
  const cleanAddress1 = sanitizeInput(address_line1);
  const cleanAddress2 = sanitizeInput(address_line2);
  const cleanInstagram = sanitizeUrl(instagram || '');
  const cleanFacebook = sanitizeUrl(facebook || '');
  const cleanYoutube = sanitizeUrl(youtube || '');
  const cleanQrCodeUrl = sanitizeUrl(qr_code_url || '/favicon.png');

  try {
    const updated = await Setting.findOneAndUpdate(
      { key: 'contact_info' },
      {
        value: {
          phone: cleanPhone,
          email: cleanEmail,
          address_line1: cleanAddress1,
          address_line2: cleanAddress2,
          instagram: cleanInstagram,
          facebook: cleanFacebook,
          youtube: cleanYoutube,
          qr_code_url: cleanQrCodeUrl
        }
      },
      { new: true, upsert: true }
    );
    return res.status(200).json({ message: 'Contact configuration updated successfully.', contact: updated.value });
  } catch (err) {
    console.error('Error updating contact config:', err.message);
    return res.status(500).json({ message: 'Failed to update contact configuration.' });
  }
};

// 12b. Get Email Configuration (Admin only)
exports.getEmailConfig = async (req, res) => {
  try {
    const setting = await Setting.findOne({ key: 'email_config' });
    const defaultEmail = {
      api_key: process.env.BREVO_API_KEY || '',
      sender_email: process.env.BREVO_SENDER_EMAIL || '',
      sender_name: process.env.BREVO_SENDER_NAME || 'PrimeNet Admin'
    };
    let config = setting ? JSON.parse(JSON.stringify(setting.value)) : defaultEmail;
    return res.status(200).json(config);
  } catch (err) {
    console.error('Error fetching email config:', err.message);
    return res.status(500).json({ message: 'Failed to retrieve email configuration.' });
  }
};

// 12c. Update Email Configuration (Admin only)
exports.updateEmailConfig = async (req, res) => {
  const { api_key, sender_email, sender_name } = req.body;

  if (!sender_email || !sender_name) {
    return res.status(400).json({ message: 'Sender email and sender name are required.' });
  }

  const cleanApiKey = api_key ? sanitizeInput(api_key) : '';
  const cleanSenderEmail = sanitizeInput(sender_email);
  const cleanSenderName = sanitizeInput(sender_name);

  try {
    const updated = await Setting.findOneAndUpdate(
      { key: 'email_config' },
      {
        value: {
          api_key: cleanApiKey,
          sender_email: cleanSenderEmail,
          sender_name: cleanSenderName
        }
      },
      { new: true, upsert: true }
    );
    return res.status(200).json({ message: 'Email configuration updated successfully.', value: updated.value });
  } catch (err) {
    console.error('Error updating email config:', err.message);
    return res.status(500).json({ message: 'Failed to update email configuration.' });
  }
};

// 13. Detect client IP and ISP (Public)
exports.detectIP = async (req, res) => {
  let clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  
  // Strip IPv6-mapped IPv4 prefix if present
  if (clientIP && clientIP.startsWith('::ffff:')) {
    clientIP = clientIP.substring(7);
  }

  // Handle local loopback IP checks
  const isLocal = !clientIP || clientIP === '127.0.0.1' || clientIP === '::1' || clientIP.startsWith('192.168.') || clientIP.startsWith('10.') || clientIP.startsWith('172.');

  try {
    let url = 'http://ip-api.com/json/';
    if (!isLocal) {
      url = `http://ip-api.com/json/${clientIP}`;
    }

    const data = await fetchJSON(url);
    if (data && data.status === 'success') {
      return res.status(200).json({
        ip: data.query,
        isp: data.isp || data.org || 'Local ISP',
        country: data.country || 'India',
        city: data.city || 'Dhenkanal'
      });
    } else {
      throw new Error('IP lookup status not success');
    }
  } catch (err) {
    try {
      let url = 'https://ipapi.co/json/';
      if (!isLocal) {
        url = `https://ipapi.co/${clientIP}/json/`;
      }
      const data = await fetchJSON(url);
      return res.status(200).json({
        ip: data.ip || clientIP,
        isp: data.org || data.asn || 'Local ISP',
        country: data.country_name || 'India',
        city: data.city || 'Dhenkanal'
      });
    } catch (fallbackErr) {
      return res.status(200).json({
        ip: isLocal ? '127.0.0.1' : clientIP,
        isp: 'Local Broadband Connection',
        country: 'India',
        city: 'Dhenkanal'
      });
    }
  }
};

// Helper for promise-based upload_large
const uploadToCloudinaryLarge = (filePath, options) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_large(filePath, options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
};

// 14. File Upload (Cloudinary Only)
exports.uploadFile = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded.' });
  }

  const tempFilePath = req.file.path;

  try {
    // Check if Cloudinary is configured
    if (!isCloudinaryConfigured) {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      return res.status(500).json({ message: 'Server error: Cloudinary environment variables are not configured.' });
    }

    const result = await uploadToCloudinaryLarge(tempFilePath, {
      folder: 'primenet',
      resource_type: 'auto'
    });
    
    // Delete local temp file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    return res.status(200).json({ url: result.secure_url });
  } catch (err) {
    console.error('File upload error:', err.message);
    if (fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch (e) {}
    }
    return res.status(500).json({ message: 'Failed to upload file to Cloudinary.' });
  }
};

// 15. Send Mail Broadcast (Admin only)
exports.sendMailBroadcast = async (req, res) => {
  const { recipients, subject, message } = req.body;

  if (!recipients || !subject || !message) {
    return res.status(400).json({ message: 'Recipients group, subject, and message are required.' });
  }

  if (!['All', 'Pending', 'Accepted', 'Rejected'].includes(recipients)) {
    return res.status(400).json({ message: 'Invalid recipient group selected.' });
  }

  try {
    let query = {};
    if (recipients !== 'All') {
      query.status = recipients;
    }

    const students = await Student.find(query);
    if (students.length === 0) {
      return res.status(404).json({ message: `No students found with registration status matching: ${recipients}` });
    }

    const emailService = require('../utils/emailService');
    let successCount = 0;
    let failCount = 0;

    for (const student of students) {
      try {
        const sent = await emailService.sendBroadcastEmail(student.email, student.name, subject, message);
        if (sent) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        console.error(`[Broadcast Error] Failed to send to ${student.email}:`, err.message);
        failCount++;
      }
    }

    return res.status(200).json({
      message: `Broadcast completed. Sent: ${successCount}, Failed: ${failCount}.`
    });
  } catch (err) {
    console.error('Mail broadcast error:', err.message);
    return res.status(500).json({ message: 'Failed to process mail broadcast.' });
  }
};

