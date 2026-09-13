const mongoose = require('mongoose');

const DepartmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    // REMOVE unique: true — departments can exist in multiple sites
  },
  code: {
    type: String,
    required: true,
    uppercase: true,
    // REMOVE unique: true too
  },
  head: {
    type: String,
    required: true,
  },
  site_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
    required: true,
  },
  activeMembers: {
    type: Number,
    default: 0,
  },
  totalRegistered: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

// Create a compound unique index: name + site_id
DepartmentSchema.index({ name: 1, site_id: 1 }, { unique: true });
// Also make code + site_id unique
DepartmentSchema.index({ code: 1, site_id: 1 }, { unique: true });

module.exports = mongoose.model('Department', DepartmentSchema);