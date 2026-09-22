const Employee = require('../models/Employee');
const Department = require('../models/Department');
const cloudinary = require('cloudinary').v2;

// Helper: update department counts
const updateDepartmentCounts = async (departmentName) => {
  if (!departmentName) return;
  try {
    const total = await Employee.countDocuments({ department: departmentName });
    const active = await Employee.countDocuments({
      department: departmentName,
      status: 'Active',
    });

    await Department.findOneAndUpdate(
      { name: departmentName },
      { totalRegistered: total, activeMembers: active },
      { new: true }
    );

    console.log(`Updated counts for ${departmentName}: ${active}/${total}`);
  } catch (error) {
    console.error(`Error updating counts for ${departmentName}:`, error);
  }
};

// Helper: delete an image from Cloudinary
const deleteImageFile = async (imageUrl) => {
  if (!imageUrl) return;
  // Only attempt delete if it's a Cloudinary URL
  if (!imageUrl.includes('res.cloudinary.com')) return;

  try {
    // Extract public_id from URL:
    // https://res.cloudinary.com/<cloud>/image/upload/v123/mealtrack/employees/employee-xxx.png
    // → mealtrack/employees/employee-xxx
    const match = imageUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(\.\w+)?$/);
    if (match && match[1]) {
      await cloudinary.uploader.destroy(match[1]);
      console.log('🗑️ Deleted from Cloudinary:', match[1]);
    }
  } catch (err) {
    console.error('Error deleting Cloudinary image:', err.message);
  }
};

// Validate phone format: +92 3XX-XXXXXXX
const isValidPhone = (phone) => /^\+92 3\d{2}-\d{7}$/.test(phone);

// Validate CNIC format: 12345-6789012-3
const isValidCnic = (cnic) => /^\d{5}-\d{7}-\d$/.test(cnic);

// @desc    Get all employees
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

// @desc    Get single employee
const getEmployeeById = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id).populate('site_id', 'code name');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    if (req.user.role === 'site_admin' && employee.site_id._id.toString() !== req.user.site_id.toString()) {
      return res.status(403).json({ message: 'Access denied: Employee not in your site' });
    }
    res.json(employee);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create employee
const createEmployee = async (req, res) => {
  const { empId, name, email, department, site_id, shifts, role, status, is_registered, phone, cnic } = req.body;

  try {
    if (!phone || !isValidPhone(phone)) {
      if (req.file) await deleteImageFile(req.file.path);
      return res.status(400).json({ message: 'Phone must be in format: +92 3XX-XXXXXXX' });
    }
    if (!cnic || !isValidCnic(cnic)) {
      if (req.file) await deleteImageFile(req.file.path);
      return res.status(400).json({ message: 'CNIC must be in format: 12345-6789012-3' });
    }

    const employeeExists = await Employee.findOne({ $or: [{ empId }, { email }, { cnic }] });
    if (employeeExists) {
      if (req.file) await deleteImageFile(req.file.path);
      return res.status(400).json({ message: 'Employee ID, Email, or CNIC already exists' });
    }

    let finalSiteId = site_id;
    if (req.user.role === 'site_admin') finalSiteId = req.user.site_id;
    if (!finalSiteId) finalSiteId = '6a9d6e038dcda3144e04072e';

    let parsedShifts = shifts;
    if (typeof shifts === 'string') {
      try { parsedShifts = JSON.parse(shifts); } catch { parsedShifts = []; }
    }

    // req.file.path is now the full Cloudinary URL
    const imageUrl = req.file ? req.file.path : null;

    const employee = await Employee.create({
      empId, name, email, department,
      site_id: finalSiteId,
      shifts: parsedShifts,
      role, status, is_registered, phone, cnic,
      image: imageUrl,
    });

    await updateDepartmentCounts(department);

    const populatedEmployee = await Employee.findById(employee._id).populate('site_id', 'code name');
    res.status(201).json(populatedEmployee);
  } catch (error) {
    if (req.file) await deleteImageFile(req.file.path);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update employee
const updateEmployee = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      if (req.file) await deleteImageFile(req.file.path);
      return res.status(404).json({ message: 'Employee not found' });
    }

    if (req.user.role === 'site_admin' && employee.site_id.toString() !== req.user.site_id.toString()) {
      if (req.file) await deleteImageFile(req.file.path);
      return res.status(403).json({ message: 'Access denied: Employee not in your site' });
    }

    if (req.body.phone !== undefined && req.body.phone !== '') {
      if (!isValidPhone(req.body.phone)) {
        if (req.file) await deleteImageFile(req.file.path);
        return res.status(400).json({ message: 'Phone must be in format: +92 3XX-XXXXXXX' });
      }
    }

    if (req.body.cnic !== undefined && req.body.cnic !== '') {
      if (!isValidCnic(req.body.cnic)) {
        if (req.file) await deleteImageFile(req.file.path);
        return res.status(400).json({ message: 'CNIC must be in format: 12345-6789012-3' });
      }
      if (req.body.cnic !== employee.cnic) {
        const cnicExists = await Employee.findOne({ cnic: req.body.cnic, _id: { $ne: employee._id } });
        if (cnicExists) {
          if (req.file) await deleteImageFile(req.file.path);
          return res.status(400).json({ message: 'CNIC already exists' });
        }
      }
    }

    const oldDepartment = employee.department;
    const newDepartment = req.body.department || oldDepartment;

    // If new image uploaded, delete the old one
    if (req.file && employee.image) {
      await deleteImageFile(employee.image);
    }

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

    // New image? Use Cloudinary URL
    if (req.file) {
      if (employee.image) await deleteImageFile(employee.image);
      employee.image = req.file.path;
    } else if (req.body.removeImage === 'true' && employee.image) {
      await deleteImageFile(employee.image);
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
    if (req.file) await deleteImageFile(req.file.path);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete employee
const deleteEmployee = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    if (req.user.role === 'site_admin' && employee.site_id.toString() !== req.user.site_id.toString()) {
      return res.status(403).json({ message: 'Access denied: Employee not in your site' });
    }

    const departmentName = employee.department;
    const imageUrl = employee.image;

    await employee.deleteOne();

    if (imageUrl) {
      await deleteImageFile(imageUrl);
    }

    await updateDepartmentCounts(departmentName);

    res.json({ message: 'Employee removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getEmployees, getEmployeeById, createEmployee, updateEmployee, deleteEmployee };