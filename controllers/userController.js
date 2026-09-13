const User = require('../models/User');
const Employee = require('../models/Employee');
const Site = require('../models/Site');
const bcrypt = require('bcryptjs');

// @desc    Get ALL people (users + employees merged)
// @route   GET /api/users
// @access  Private (Super Admin only)
const getUsers = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied: Super Admin only' });
    }

    const { search, role, site_id } = req.query;

    let userQuery = {};
    if (search) {
      userQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    if (role && role !== 'All' && ['super_admin', 'site_admin'].includes(role)) {
      userQuery.role = role;
    }
    if (site_id && site_id !== 'All') {
      userQuery.site_id = site_id;
    }

    const users = await User.find(userQuery).select('-password').populate('site_id', 'name code');

    let employeeQuery = {};
    if (search) {
      employeeQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { empId: { $regex: search, $options: 'i' } },
      ];
    }
    if (site_id && site_id !== 'All') {
      employeeQuery.site_id = site_id;
    }

    let employees = [];
    if (!role || role === 'All' || role === 'employee') {
      employees = await Employee.find(employeeQuery).populate('site_id', 'name code');
    }

    const employeesAsUsers = employees.map(emp => ({
      _id: emp._id,
      name: emp.name,
      email: emp.email,
      empId: emp.empId,
      role: 'employee',
      site_id: emp.site_id,
      permissions: {
        pages: {
          dashboard: false,
          messSites: false,
          employees: false,
          shifts: false,
          devices: false,
          departments: false,
          reports: false,
        },
        viewAllSites: false,
        exportData: false,
      },
      source: 'employee',
    }));

    const usersMarked = users.map(u => ({
      ...u.toObject(),
      source: 'user',
    }));

    const merged = [...usersMarked, ...employeesAsUsers];

    res.json(merged);
  } catch (error) {
    console.error('getUsers error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Promote an employee to Site Admin (creates a User)
// @route   POST /api/users/promote
// @access  Private (Super Admin only)
const promoteEmployee = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied: Super Admin only' });
    }

    const { employeeId, role, site_id, password } = req.body;

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const existing = await User.findOne({ email: employee.email });
    if (existing) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    const newRole = role || 'site_admin';
    const finalSiteId = site_id || employee.site_id;

    if (!finalSiteId) {
      return res.status(400).json({ message: 'Site is required' });
    }

    const plainPassword = password || 'password123';

    const defaultPermissions = {
      pages: {
        dashboard: true,
        messSites: true,
        employees: true,
        shifts: true,
        devices: true,
        departments: true,
        reports: true,
      },
      viewAllSites: false,
      exportData: false,
    };

    const user = await User.create({
      name: employee.name,
      email: employee.email,
      password: plainPassword,
      role: newRole,
      site_id: finalSiteId,
      permissions: defaultPermissions,
    });

    const populated = await User.findById(user._id).select('-password').populate('site_id', 'name code');

    res.status(201).json({
      ...populated.toObject(),
      source: 'user',
      tempPassword: plainPassword,
    });
  } catch (error) {
    console.error('promoteEmployee error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update permissions
const updateUserPermissions = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied: Super Admin only' });
    }

    const { permissions } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'super_admin') {
      return res.status(400).json({ message: 'Cannot modify Super Admin permissions' });
    }

    user.permissions = {
      pages: {
        dashboard:   permissions.pages?.dashboard   ?? user.permissions.pages.dashboard,
        messSites:   permissions.pages?.messSites   ?? user.permissions.pages.messSites,
        employees:   permissions.pages?.employees   ?? user.permissions.pages.employees,
        shifts:      permissions.pages?.shifts      ?? user.permissions.pages.shifts,
        devices:     permissions.pages?.devices     ?? user.permissions.pages.devices,
        departments: permissions.pages?.departments ?? user.permissions.pages.departments,
        reports:     permissions.pages?.reports     ?? user.permissions.pages.reports,
      },
      viewAllSites: permissions.viewAllSites ?? user.permissions.viewAllSites,
      exportData:   permissions.exportData   ?? user.permissions.exportData,
    };

    await user.save();
    const updated = await User.findById(user._id).select('-password').populate('site_id', 'name code');
    res.json({ ...updated.toObject(), source: 'user' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user role
const updateUserRole = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied: Super Admin only' });
    }

    const { role } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'super_admin') {
      return res.status(400).json({ message: 'Cannot modify Super Admin' });
    }

    const validRoles = ['site_admin', 'employee'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    if (role === 'employee') {
      await user.deleteOne();
      return res.json({ _id: user._id, role: 'employee', deleted: true });
    }

    user.role = role;
    await user.save();

    const updated = await User.findById(user._id).select('-password').populate('site_id', 'name code');
    res.json({ ...updated.toObject(), source: 'user' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Reset a user's password
// @route   PUT /api/users/:id/password
// @access  Private (Super Admin only)
const resetUserPassword = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied: Super Admin only' });
    }

    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'super_admin') {
      return res.status(400).json({ message: 'Cannot modify Super Admin' });
    }

    user.password = password;
    await user.save();

    const updated = await User.findById(user._id).select('-password').populate('site_id', 'name code');
    res.json({ ...updated.toObject(), source: 'user' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single user
const getUserById = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    const user = await User.findById(req.params.id).select('-password').populate('site_id', 'name code');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getUsers,
  getUserById,
  updateUserPermissions,
  updateUserRole,
  promoteEmployee,
  resetUserPassword,
};