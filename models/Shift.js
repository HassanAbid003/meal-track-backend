const mongoose = require('mongoose');

const ShiftSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    enum: ['Breakfast', 'Lunch', 'Dinner'],
  },
  start_time: {
    type: String, // Format: "07:00"
    required: true,
  },
  end_time: {
    type: String, // Format: "09:00"
    required: true,
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active',
  },
  site_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
    required: true,
  },
}, { timestamps: true });

// ─── Index ────────────────────────────────────────────────────────
// verifyScan runs this query on every single scan:
//   Shift.findOne({
//     site_id: device.site_id,
//     status: 'Active',
//     start_time: { $lte: currentTime },
//     end_time:   { $gte: currentTime },
//   })
// This compound index makes it a single index seek instead of a collection scan.
ShiftSchema.index({ site_id: 1, status: 1, start_time: 1, end_time: 1 });

module.exports = mongoose.model('Shift', ShiftSchema);