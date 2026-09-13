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

module.exports = mongoose.model('Shift', ShiftSchema);