const Employee = require('../models/Employee');
const Department = require('../models/Department');
const fs = require('fs');
const path = require('path');

// Helper function to update department counts
const updateDepartmentCounts = async (departmentName) => {
  if (!departmentName) return;

  try {
    const total = await Employee.countDocuments({
      department: departmentName
    });

    const active = await Employee.countDocuments({
      department: departmentName,
      status: 'Active'
    });

    await Department.findOneAndUpdate(
      { name: departmentName },
      {
        totalRegistered: total,
        activeMembers: active
      },
      { new: true }
    );

    console.log(`Updated counts for ${departmentName}: ${active}/${total}`);
  } catch (error) {
    console.error(`Error updating counts for ${departmentName}:`, error);
  }
};

// Helper to delete an old image file
const deleteImageFile = (imagePath) => {
  if (!imagePath) return;
  const fullPath = path.join(__dirname, '..', imagePath);
  fs.unlink(fullPath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error('Error deleting image file:', err);
    }
  });
};

// Helper to validate phone format: +92 3XX-XXXXXXX
const isValidPhone = (phone) => {
  return /^\+92 3\d{2}-\d{7}$/.test(phone);
};

// Helper to validate CNIC format: 12345-6789012-3
const isValidCnic = (cnic) => {
  return /^\d{5}-\d{7}-\d$/.test(cnic);
};

// @desc    Get all employees
// @route   GET /api/employees
// @access  Private
const getEmployees = async (req, res) => {
  try {
    let query = {};

    if (req.user.role === 'site_admin') {
      query.site_id = req.user.site_id;
    }

    const employees = await Employee.find(query).populate('site_id', 'code name');
    res.json(employees);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single employee by ID
// @route   GET /api/employees/:id
// @access  Private
const getEmployeeById = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id).populate('site_id', 'code name');

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    if (req.user.role === 'site_admin' && employee.site_id._id.toString() !== req.user.site_id.toString()) {
      return res.status(403).json({ message: 'Access denied: Employee not in your site' });
    }

    res.json(employee);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new employee
// @route   POST /api/employees
// @access  Private (Super Admin / Site Admin)
const createEmployee = async (req, res) => {
  const { empId, name, email, department, site_id, shifts, role, status, is_registered, phone, cnic } = req.body;

  try {
    // Validate phone
    if (!phone || !isValidPhone(phone)) {
      if (req.file) deleteImageFile(`/uploads/employees/${req.file.filename}`);
      return res.status(400).json({ message: 'Phone must be in format: +92 3XX-XXXXXXX' });
    }

    // Validate CNIC
    if (!cnic || !isValidCnic(cnic)) {
      if (req.file) deleteImageFile(`/uploads/employees/${req.file.filename}`);
      return res.status(400).json({ message: 'CNIC must be in format: 12345-6789012-3' });
    }

    // Check for existing empId, email, or cnic
    const employeeExists = await Employee.findOne({
      $or: [{ empId }, { email }, { cnic }]
    });
    if (employeeExists) {
      if (req.file) deleteImageFile(`/uploads/employees/${req.file.filename}`);
      return res.status(400).json({ message: 'Employee ID, Email, or CNIC already exists' });
    }

    // If Site Admin, force their site_id
    let finalSiteId = site_id;
    if (req.user.role === 'site_admin') {
      finalSiteId = req.user.site_id;
    }

    if (!finalSiteId) {
      finalSiteId = '6a9d6e038dcda3144e04072e';
    }

    // Parse shifts if it came as a JSON string from FormData
    let parsedShifts = shifts;
    if (typeof shifts === 'string') {
      try { parsedShifts = JSON.parse(shifts); } catch { parsedShifts = []; }
    }

    const imagePath = req.file ? `/uploads/employees/${req.file.filename}` : null;

    const employee = await Employee.create({
      empId,
      name,
      email,
      department,
      site_id: finalSiteId,
      shifts: parsedShifts,
      role,
      status,
      is_registered,
      phone,
      cnic,
      image: imagePath,
    });

    await updateDepartmentCounts(department);

    const populatedEmployee = await Employee.findById(employee._id).populate('site_id', 'code name');
    res.status(201).json(populatedEmployee);
  } catch (error) {
    if (req.file) deleteImageFile(`/uploads/employees/${req.file.filename}`);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update an employee
// @route   PUT /api/employees/:id
// @access  Private (Super Admin / Site Admin)
const updateEmployee = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      if (req.file) deleteImageFile(`/uploads/employees/${req.file.filename}`);
      return res.status(404).json({ message: 'Employee not found' });
    }

    if (req.user.role === 'site_admin' && employee.site_id.toString() !== req.user.site_id.toString()) {
      if (req.file) deleteImageFile(`/uploads/employees/${req.file.filename}`);
      return res.status(403).json({ message: 'Access denied: Employee not in your site' });
    }

    // Validate phone if provided
    if (req.body.phone !== undefined && req.body.phone !== '') {
      if (!isValidPhone(req.body.phone)) {
        if (req.file) deleteImageFile(`/uploads/employees/${req.file.filename}`);
        return res.status(400).json({ message: 'Phone must be in format: +92 3XX-XXXXXXX' });
      }
    }

    // Validate CNIC if provided
    if (req.body.cnic !== undefined && req.body.cnic !== '') {
      if (!isValidCnic(req.body.cnic)) {
        if (req.file) deleteImageFile(`/uploads/employees/${req.file.filename}`);
        return res.status(400).json({ message: 'CNIC must be in format: 12345-6789012-3' });
      }

      // Check CNIC uniqueness (if changed)
      if (req.body.cnic !== employee.cnic) {
        const cnicExists = await Employee.findOne({ cnic: req.body.cnic, _id: { $ne: employee._id } });
        if (cnicExists) {
          if (req.file) deleteImageFile(`/uploads/employees/${req.file.filename}`);
          return res.status(400).json({ message: 'CNIC already exists' });
        }
      }
    }

    const oldDepartment = employee.department;
    const newDepartment = req.body.department || oldDepartment;

    // If new image uploaded, delete the old one
    if (req.file && employee.image) {
      deleteImageFile(employee.image);
    }

    // Parse shifts if it came as a JSON string
    let parsedShifts = req.body.shifts;
    if (typeof parsedShifts === 'string') {
      try { parsedShifts = JSON.parse(parsedShifts); } catch { parsedShifts = employee.shifts; }
    }

    employee.empId = req.body.empId || employee.empId;
    employee.name = req.body.name || employee.name;
    employee.email = req.body.email || employee.email;
    employee.department = req.body.department || employee.department;
    employee.site_id = req.body.site_id || employee.site_id;
    employee.shifts = parsedShifts || employee.shifts;
    employee.role = req.body.role || employee.role;
    employee.status = req.body.status || employee.status;
    employee.barcode = req.body.barcode || employee.barcode;
    employee.is_registered = req.body.is_registered !== undefined ? req.body.is_registered : employee.is_registered;
    employee.phone = req.body.phone !== undefined ? req.body.phone : employee.phone;
    employee.cnic = req.body.cnic !== undefined ? req.body.cnic : employee.cnic;

    if (req.file) {
      if (employee.image) {
        deleteImageFile(employee.image);
      }
      employee.image = `/uploads/employees/${req.file.filename}`;
    } else if (req.body.removeImage === 'true' && employee.image) {
      deleteImageFile(employee.image);
      employee.image = null;
    }
    
    const updatedEmployee = await employee.save();

    if (oldDepartment !== newDepartment) {
      await updateDepartmentCounts(oldDepartment);
      await updateDepartmentCounts(newDepartment);
    } else {
      await updateDepartmentCounts(oldDepartment);
    }

    const populatedEmployee = await Employee.findById(updatedEmployee._id).populate('site_id', 'code name');
    res.json(populatedEmployee);
  } catch (error) {
    if (req.file) deleteImageFile(`/uploads/employees/${req.file.filename}`);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete an employee
// @route   DELETE /api/employees/:id
// @access  Private (Super Admin only)
const deleteEmployee = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    if (req.user.role === 'site_admin' && employee.site_id.toString() !== req.user.site_id.toString()) {
      return res.status(403).json({ message: 'Access denied: Employee not in your site' });
    }

    const departmentName = employee.department;
    const imagePath = employee.image;

    await employee.deleteOne();

    if (imagePath) {
      deleteImageFile(imagePath);
    }

    await updateDepartmentCounts(departmentName);

    res.json({ message: 'Employee removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getEmployees, getEmployeeById, createEmployee, updateEmployee, deleteEmployee };