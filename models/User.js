const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['super_admin', 'site_admin', 'mess_keeper', 'employee'],
    default: 'employee',
  },
  site_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
    default: null,
  },
  // PAGE-BASED PERMISSIONS
  permissions: {
    pages: {
      dashboard:   { type: Boolean, default: true },
      messSites:   { type: Boolean, default: false },
      employees:   { type: Boolean, default: true },
      shifts:      { type: Boolean, default: false },
      devices:     { type: Boolean, default: false },
      departments: { type: Boolean, default: false },
      reports:     { type: Boolean, default: true },
    },
    viewAllSites: { type: Boolean, default: false },
    exportData:   { type: Boolean, default: false },
  },
}, { timestamps: true });

// Hash password before saving
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);