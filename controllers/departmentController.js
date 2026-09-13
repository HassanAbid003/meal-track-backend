const Department = require('../models/Department');
const Site = require('../models/Site');
const Employee = require('../models/Employee');

// @desc    Get all departments with employee counts
// @route   GET /api/departments
// @access  Private
const getDepartments = async (req, res) => {
  try {
    // console.log('🔵 Fetching departments with employee counts...');
    // console.log('👤 User role:', req.user.role);
    
    let query = {};
    
    // If Site Admin or Mess Keeper, only show departments from their site
    if (req.user.role === 'site_admin' || req.user.role === 'mess_keeper') {
      query.site_id = req.user.site_id;
      // console.log('📍 Filtering by site:', req.user.site_id);
    }
    
    // Get all departments (filtered by site for Site Admin)
    const departments = await Department.find(query).populate('site_id', 'name code');
    
    // Get employees - FILTERED BY SITE for Site Admin
    let employeeQuery = {};
    if (req.user.role === 'site_admin' || req.user.role === 'mess_keeper') {
      employeeQuery.site_id = req.user.site_id;
    }
    
    const employees = await Employee.find(employeeQuery).select('department status');
    
    // console.log(`📋 Found ${departments.length} departments, ${employees.length} employees`);
    
    // Count employees by department name
    const deptCounts = {};
    employees.forEach(emp => {
      if (!deptCounts[emp.department]) {
        deptCounts[emp.department] = {
          totalRegistered: 0,
          activeMembers: 0
        };
      }
      deptCounts[emp.department].totalRegistered++;
      if (emp.status === 'Active') {
        deptCounts[emp.department].activeMembers++;
      }
    });
    
    // Merge counts with departments
    const departmentsWithCounts = departments.map(dept => {
      const counts = deptCounts[dept.name] || { totalRegistered: 0, activeMembers: 0 };
      return {
        ...dept.toObject(),
        totalRegistered: counts.totalRegistered,
        activeMembers: counts.activeMembers
      };
    });
    
    // console.log(`✅ Returning ${departmentsWithCounts.length} departments`);
    res.status(200).json(departmentsWithCounts);
    
  } catch (error) {
    // console.error('🔴 Error in getDepartments:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new department
// @route   POST /api/departments
// @access  Private
const createDepartment = async (req, res) => {
  try {
    const { name, code, head, site_id } = req.body;

    // console.log('🔵 Creating department:', { name, code, head, site_id });

    // FORCE SITE FOR SITE ADMINS
    let finalSiteId = site_id;
    
    if (req.user.role === 'site_admin' || req.user.role === 'mess_keeper') {
      finalSiteId = req.user.site_id;
      // console.log('📍 Forcing site to:', finalSiteId);
    }

    // Check if department already exists FOR THIS SITE
    const existingDepartment = await Department.findOne({
      $or: [{ name }, { code: code.toUpperCase() }],
      site_id: finalSiteId
    });

    if (existingDepartment) {
      return res.status(400).json({
        message: 'Department with this name or code already exists for this site'
      });
    }

    // Check if site exists
    const site = await Site.findById(finalSiteId);
    if (!site) {
      return res.status(404).json({ message: 'Site not found' });
    }

    // Create department (counts will be 0 initially)
    const department = await Department.create({
      name,
      code: code.toUpperCase(),
      head,
      site_id: finalSiteId,
      activeMembers: 0,
      totalRegistered: 0
    });

    // Get populated department
    const populatedDepartment = await Department.findById(department._id)
      .populate('site_id', 'name code');

    // console.log('✅ Department created:', populatedDepartment.name);
    res.status(201).json(populatedDepartment);
    
  } catch (error) {
    // console.error('🔴 Error in createDepartment:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a department
// @route   PUT /api/departments/:id
// @access  Private
const updateDepartment = async (req, res) => {
  try {
    const { name, code, head, site_id } = req.body;
    const department = await Department.findById(req.params.id);

    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }

    // CHECK SITE ADMIN ACCESS
    if (req.user.role === 'site_admin' || req.user.role === 'mess_keeper') {
      if (department.site_id.toString() !== req.user.site_id.toString()) {
        return res.status(403).json({ message: 'Access denied: Department not in your site' });
      }
    }

    // Check for duplicate name/code (only for this site)
    if (name || code) {
      const existingDepartment = await Department.findOne({
        _id: { $ne: req.params.id },
        site_id: department.site_id,
        $or: [
          { name: name },
          { code: code ? code.toUpperCase() : undefined }
        ]
      });

      if (existingDepartment) {
        return res.status(400).json({
          message: 'Department with this name or code already exists'
        });
      }
    }

    // Update fields
    department.name = name || department.name;
    department.code = code ? code.toUpperCase() : department.code;
    department.head = head || department.head;
    
    // ONLY SUPER ADMIN CAN CHANGE SITE
    if (req.user.role === 'super_admin' && site_id) {
      department.site_id = site_id;
    }

    const updatedDepartment = await department.save();
    const populatedDepartment = await Department.findById(updatedDepartment._id)
      .populate('site_id', 'name code');

    // console.log('✅ Department updated:', populatedDepartment.name);
    res.status(200).json(populatedDepartment);
    
  } catch (error) {
    // console.error('🔴 Error in updateDepartment:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a department
// @route   DELETE /api/departments/:id
// @access  Private (Super Admin only)
const deleteDepartment = async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);

    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }

    // ONLY SUPER ADMIN CAN DELETE
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied: Only Super Admin can delete departments' });
    }

    // Check if employees exist in this department
    const employeeCount = await Employee.countDocuments({ 
      department: department.name,
      site_id: department.site_id
    });
    
    if (employeeCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete department with ${employeeCount} employees. Please reassign or remove employees first.` 
      });
    }

    await department.deleteOne();
    // console.log('✅ Department deleted:', department.name);
    res.status(200).json({ message: 'Department removed successfully' });
    
  } catch (error) {
    // console.error('🔴 Error in deleteDepartment:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
};