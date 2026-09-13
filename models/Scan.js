const mongoose = require('mongoose');

const ScanSchema = new mongoose.Schema({
  employee_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: false,  // ← Change to false
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
}, { timestamps: true });

module.exports = mongoose.model('Scan', ScanSchema);