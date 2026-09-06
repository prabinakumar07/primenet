const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/primenet';

mongoose.connect(mongoURI)
  .then(() => {
    console.log('Connected to MongoDB database.');
    seedHostels();
    seedAdminUser();
    seedDefaultSettings();
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
  });

// 1. Hostel Schema
const hostelSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true }
});

// 2. Student Schema
const studentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  mobile: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true },
  hostel_id: { type: String, required: true, enum: ['mahima', 'kapilash'], default: 'kapilash', index: true },
  room_number: { type: String, required: true, trim: true },
  room_type: { type: String, required: true, enum: ['A', 'B'], uppercase: true },
  mac_address: { type: String, required: true, trim: true },
  mac_address_2: { type: String, default: '', trim: true },
  mac_address_3: { type: String, default: '', trim: true },
  mac_address_4: { type: String, default: '', trim: true },
  payment_status: { type: String, default: 'Unpaid', enum: ['Paid', 'Unpaid', 'Partially Paid'] },
  screenshot_url: { type: String, default: '' },
  pay_later_date: { type: Date, default: null },
  status: { type: String, default: 'Pending', enum: ['Pending', 'Accepted', 'Rejected'] },
  payment_method: { type: String, default: 'O', enum: ['C', 'O'] },
  created_at: { type: Date, default: Date.now }
});

studentSchema.index({ hostel_id: 1, status: 1 });

// 3. User Schema (Admin User)
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true, trim: true },
  password: { type: String, required: true },
  hostel_access: { type: String, default: 'all', enum: ['all', 'mahima', 'kapilash'] }
});

// 4. Settings Schema
const settingSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true }
});

const Hostel = mongoose.model('Hostel', hostelSchema);
const Student = mongoose.model('Student', studentSchema);
const User = mongoose.model('User', userSchema);
const Setting = mongoose.model('Setting', settingSchema);

// Seeding functions
async function seedHostels() {
  try {
    const hostelsData = [
      {
        id: 'mahima',
        name: 'Mahima Chatrabash',
        code: 'mahima',
        label: 'Mahima Chatrabash (New Hostel)'
      },
      {
        id: 'kapilash',
        name: 'Kapilash Chatrabash',
        code: 'kapilash',
        label: 'Kapilash Chatrabash (Old Hostel)'
      }
    ];

    for (const h of hostelsData) {
      const exists = await Hostel.findOne({ id: h.id });
      if (!exists) {
        await new Hostel(h).save();
        console.log(`Seeded hostel: ${h.label}`);
      }
    }

    // Safe migration: check for any existing students without hostel_id or with null/undefined
    const unassignedCount = await Student.countDocuments({
      $or: [
        { hostel_id: { $exists: false } },
        { hostel_id: null },
        { hostel_id: '' }
      ]
    });

    if (unassignedCount > 0) {
      console.log(`Migrating ${unassignedCount} existing students without hostel assignment to Kapilash Chatrabash (Old Hostel)...`);
      const result = await Student.updateMany(
        {
          $or: [
            { hostel_id: { $exists: false } },
            { hostel_id: null },
            { hostel_id: '' }
          ]
        },
        { $set: { hostel_id: 'kapilash' } }
      );
      console.log(`Successfully migrated ${result.modifiedCount} students to Kapilash Chatrabash. All student data and MAC addresses preserved.`);
    }
  } catch (err) {
    console.error('Error seeding hostels and migrating students:', err.message);
  }
}

async function seedAdminUser() {
  const superUsername = (process.env.ADMIN_USERNAME || 'admin').toLowerCase().trim();
  const superPassword = process.env.ADMIN_PASSWORD || 'primenet@2007';

  try {
    // 1. Seed or update superadmin (hostel_access: 'all')
    const existingAdmin = await User.findOne({ username: superUsername });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(superPassword, 10);
      const admin = new User({
        username: superUsername,
        password: hashedPassword,
        hostel_access: 'all'
      });
      await admin.save();
      console.log(`Superadmin user seeded successfully with username: ${superUsername} (access: all)`);
    } else {
      let needsSave = false;
      const isMatch = await bcrypt.compare(superPassword, existingAdmin.password);
      if (!isMatch) {
        existingAdmin.password = await bcrypt.hash(superPassword, 10);
        needsSave = true;
      }
      if (existingAdmin.hostel_access !== 'all') {
        existingAdmin.hostel_access = 'all';
        needsSave = true;
      }
      if (needsSave) {
        await existingAdmin.save();
        console.log(`Superadmin user updated in database (access: all).`);
      } else {
        console.log('Superadmin user already configured.');
      }
    }

    // 2. Seed scoped admin for Mahima Chatrabash (New Hostel)
    const mahimaAdmin = await User.findOne({ username: 'admin_mahima' });
    if (!mahimaAdmin) {
      const hashedMahimaPass = await bcrypt.hash(process.env.ADMIN_MAHIMA_PASSWORD || 'mahima@2026', 10);
      await new User({
        username: 'admin_mahima',
        password: hashedMahimaPass,
        hostel_access: 'mahima'
      }).save();
      console.log(`Scoped admin seeded: admin_mahima (access: mahima)`);
    }

    // 3. Seed scoped admin for Kapilash Chatrabash (Old Hostel)
    const kapilashAdmin = await User.findOne({ username: 'admin_kapilash' });
    if (!kapilashAdmin) {
      const hashedKapilashPass = await bcrypt.hash(process.env.ADMIN_KAPILASH_PASSWORD || 'kapilash@2026', 10);
      await new User({
        username: 'admin_kapilash',
        password: hashedKapilashPass,
        hostel_access: 'kapilash'
      }).save();
      console.log(`Scoped admin seeded: admin_kapilash (access: kapilash)`);
    }
  } catch (err) {
    console.error('Error seeding admin users:', err.message);
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
          address_line1: 'Hostel Block-C, Server Room',
          address_line2: 'Campus Ground, Pin 751024',
          instagram: 'https://instagram.com/primenet',
          facebook: 'https://facebook.com/primenet',
          youtube: 'https://youtube.com/primenet',
          qr_code_url: 'assets/payment_qr.png'
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
  Hostel,
  Student,
  User,
  Setting,
  mongoose
};

