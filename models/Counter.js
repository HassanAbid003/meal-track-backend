const mongoose = require('mongoose');

const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },   // e.g. 'employee_empId'
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model('Counter', CounterSchema);