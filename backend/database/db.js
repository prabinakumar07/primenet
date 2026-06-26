const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/primenet';

mongoose.connect(mongoURI)
  .then(() => {
    console.log('Connected to MongoDB database.');
    seedAdminUser();
    seedDefaultSettings();
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
  });

// 1. Student Schema
const studentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  mobile: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true },
  room_number: { type: String, required: true, trim: true },
  room_type: { type: String, required: true, enum: ['A', 'B'], uppercase: true },
  mac_address: { type: String, required: true, trim: true },
  screenshot_url: { type: String, default: '' },
  status: { type: String, default: 'Pending', enum: ['Pending', 'Accepted', 'Rejected'] },
  created_at: { type: Date, default: Date.now }
});

// 2. User Schema (Admin User)
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true, trim: true },
  password: { type: String, required: true }
});

// 3. Settings Schema
const settingSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true }
});

const Student = mongoose.model('Student', studentSchema);
const User = mongoose.model('User', userSchema);
const Setting = mongoose.model('Setting', settingSchema);

// Seeding functions
async function seedAdminUser() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'primenet@2007';

  try {
    const existingAdmin = await User.findOne({ username });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(password, 10);
      const admin = new User({
        username,
        password: hashedPassword
      });
      await admin.save();
      console.log(`Admin user seeded successfully with username: ${username}`);
    } else {
      console.log('Admin user already exists. Seeding skipped.');
    }
  } catch (err) {
    console.error('Error seeding admin user:', err.message);
  }
}

async function seedDefaultSettings() {
  try {
    const existingSetting = await Setting.findOne({ key: 'speed_test_enabled' });
    if (!existingSetting) {
      const newSetting = new Setting({
        key: 'speed_test_enabled',
        value: true
      });
      await newSetting.save();
      console.log('Default settings seeded (speed_test_enabled = true).');
    }

    const existingContact = await Setting.findOne({ key: 'contact_info' });
    if (!existingContact) {
      const newContact = new Setting({
        key: 'contact_info',
        value: {
          phone: '+91 98765 43210',
          email: 'support@primenet.local',
          address_line1: 'Hostel Block-C, Server Room 10',
          address_line2: 'Campus Ground, Pin 751024',
          instagram: 'https://instagram.com/primenet',
          facebook: 'https://facebook.com/primenet',
          youtube: 'https://youtube.com/primenet',
          qr_code_url: '/favicon.png'
        }
      });
      await newContact.save();
      console.log('Default contact settings seeded with social links.');
    }
  } catch (err) {
    console.error('Error seeding default settings:', err.message);
  }
}

module.exports = {
  Student,
  User,
  Setting,
  mongoose
};

