const mongoose = require('mongoose');

const ScanSchema = new mongoose.Schema({
  employee_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: false,
  },
  device_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true,
  },
  site_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
    required: true,
  },
  status: {
    type: String,
    enum: ['allowed', 'denied'],
    required: true,
  },
  reason: {
    type: String,
    default: '',
  },
  shift: {
    type: String,
    default: null,   // 'Breakfast' | 'Lunch' | 'Dinner' | null
  },
}, { timestamps: true });

module.exports = mongoose.model('Scan', ScanSchema);