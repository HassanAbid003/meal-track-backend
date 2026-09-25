const mongoose = require('mongoose');

const DeviceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  serial: { type: String, required: true, unique: true },
  status: { type: String, enum: ['online', 'offline'], default: 'online' },
  site_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', required: true },
  lastPing: { type: Date, default: null },

  // ---- Pairing (new) ----
  pairingCodeHash: { type: String, default: null },
  pairingCodeExpires: { type: Date, default: null },
  pairingTokenHash: { type: String, default: null },
  pairedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Device', DeviceSchema);