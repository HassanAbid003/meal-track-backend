const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema({
  empId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  department: { type: String, required: true },
  site_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', required: true },
  shifts: [{ type: String, enum: ['Breakfast', 'Lunch', 'Dinner'] }],
  role: { type: String, enum: ['Employee', 'Mess Keeper'], default: 'Employee' },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  is_registered: { type: Boolean, default: true },
  barcode: { type: String, default: null },
  phone: { type: String, default: null },
  cnic: { type: String, unique: true, sparse: true, default: null },
  image: { type: String, default: null },

  // When this employee is assigned as Mess Keeper, this holds the device serial.
  // null = not assigned. A string (e.g. 'QRS-2024-001') = assigned to that device.
  device_serial: { type: String, default: null },
}, { timestamps: true });

// Fast lookup by device_serial (used when enriching device lists)
EmployeeSchema.index({ device_serial: 1 }, { sparse: true });

module.exports = mongoose.model('Employee', EmployeeSchema);