const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/primenet';

async function runMigration() {
  console.log('Connecting to MongoDB at:', mongoURI);
  await mongoose.connect(mongoURI);

  const Student = mongoose.model('Student', new mongoose.Schema({}, { strict: false }));
  const Setting = mongoose.model('Setting', new mongoose.Schema({ key: String, value: mongoose.Schema.Types.Mixed }));

  const countBefore = await Student.countDocuments();
  console.log(`Total students in database: ${countBefore}`);

  // Re-assign all existing legacy students/MACs to Mahima Chatrabash
  const result = await Student.updateMany(
    {
      $or: [
        { hostel_id: { $exists: false } },
        { hostel_id: null },
        { hostel_id: '' },
        { hostel_id: 'kapilash' }
      ]
    },
    { $set: { hostel_id: 'mahima' } }
  );

  console.log(`Successfully migrated ${result.modifiedCount} students/MACs to Mahima Chatrabash (New Hostel).`);

  await Setting.findOneAndUpdate(
    { key: 'legacy_hostel_migrated_mahima' },
    { value: { migrated: true, timestamp: new Date(), count: result.modifiedCount } },
    { upsert: true }
  );

  const mahimaCount = await Student.countDocuments({ hostel_id: 'mahima' });
  const kapilashCount = await Student.countDocuments({ hostel_id: 'kapilash' });
  console.log(`Current counts -> Mahima: ${mahimaCount}, Kapilash: ${kapilashCount}`);

  await mongoose.disconnect();
  console.log('Migration completed successfully.');
  process.exit(0);
}

runMigration().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
