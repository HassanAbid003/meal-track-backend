const mongoose = require('mongoose');

const ScanSchema = new mongoose.Schema({
  employee_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: false,
    default: null,
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
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  barcode: {
    type: String,
    default: null,
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
    default: null,
  },
}, { timestamps: true });

// ─── Indexes ──────────────────────────────────────────────────────
// getRecentScans: filter by device + sort by createdAt desc
ScanSchema.index({ device_id: 1, createdAt: -1 });

// getRecentScans (site-scoped): site_admin / mess_keeper filter
ScanSchema.index({ site_id: 1, createdAt: -1 });

// Duplicate scan check in verifyScan: employee + shift + status + today's date
ScanSchema.index({ employee_id: 1, shift: 1, status: 1, createdAt: -1 });

// getWeeklyStats: status=allowed + date range, optionally site
ScanSchema.index({ status: 1, createdAt: -1 });
ScanSchema.index({ site_id: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Scan', ScanSchema);