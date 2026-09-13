// const mongoose = require('mongoose');

// const SiteSchema = new mongoose.Schema({
//   code: {
//     type: String,
//     required: true,
//     unique: true, // e.g., MCC, TBC
//     uppercase: true,
//   },
//   name: {
//     type: String,
//     required: true, // e.g., Main Campus Canteen
//   },
//   location: {
//     type: String,
//     required: true, // e.g., Block A, Ground Floor
//   },
//   manager: {
//     type: String,
//     default: '', // e.g., Tariq Mehmood
//   },
//   is_active: {
//     type: Boolean,
//     default: true,
//   },
//   devices: [{
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Device',
//   }],
// }, { timestamps: true });

// module.exports = mongoose.model('Site', SiteSchema);

const mongoose = require('mongoose');

const SiteSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  name: { type: String, required: true },
  location: { type: String, required: true },
  manager: { type: String, default: '' },
  is_active: { type: Boolean, default: true },
  devices: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Device' }],
}, { timestamps: true });

module.exports = mongoose.model('Site', SiteSchema);