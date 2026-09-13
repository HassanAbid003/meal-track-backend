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
}, { timestamps: true });

module.exports = mongoose.model('Employee', EmployeeSchema);